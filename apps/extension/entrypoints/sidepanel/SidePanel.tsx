import { useEffect, useRef, useState } from 'react';
import { api, type EmailParseResult, type FormatParseResult } from '@/lib/api';
import { getInstallationId } from '@/lib/identity';
import type { ComposeResult, ComposeWindow, EmailDraft } from '@/lib/messages';

type Notice = { kind: 'success' | 'error' | 'info'; text: string };

export default function SidePanel() {
  const [consented, setConsented] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<EmailParseResult | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [formatInstruction, setFormatInstruction] = useState('');
  const [composeWindows, setComposeWindows] = useState<ComposeWindow[] | null>(null);
  const [pendingFormat, setPendingFormat] = useState<FormatParseResult | null>(null);
  const [ambiguous, setAmbiguous] = useState<Array<{ index: number; excerpt: string }> | null>(null);
  const formatInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void chrome.storage.local.get(['privacyAcknowledged', 'focusFormatCommandAt']).then((stored) => {
      setConsented(stored.privacyAcknowledged === true);
      if (typeof stored.focusFormatCommandAt === 'number' && Date.now() - stored.focusFormatCommandAt < 3000) {
        window.setTimeout(() => formatInput.current?.focus(), 180);
      }
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.focusFormatCommandAt) {
        window.setTimeout(() => formatInput.current?.focus(), 180);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function acceptPrivacy() {
    await chrome.storage.local.set({ privacyAcknowledged: true });
    setConsented(true);
  }

  async function parseEmail() {
    if (!transcript.trim()) return;
    setLoading(true); setNotice(null); setParsed(null); setDraft(null);
    try {
      const result = await api.parseEmail(await getInstallationId(), transcript.trim());
      setParsed(result); setRemaining(result.requestsRemaining);
      if (result.clarification) setNotice({ kind: 'info', text: result.clarification });
      else setNotice({ kind: 'success', text: 'Email details are ready. Review and edit them before filling Gmail.' });
      if (result.recipient && result.subject !== null && result.body !== null && !result.clarification) {
        setDraft({ recipient: result.recipient, subject: result.subject, body: result.body });
      }
    } catch (error) { setNotice({ kind: 'error', text: messageOf(error) }); }
    finally { setLoading(false); }
  }

  async function findComposeWindows() {
    const tab = await activeGmailTab();
    if (!tab?.id) { setNotice({ kind: 'error', text: 'Open Gmail in this tab, then open a new message first.' }); return null; }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'LIST_COMPOSES' }) as { windows?: ComposeWindow[] };
      const windows = response.windows ?? [];
      if (!windows.length) { setNotice({ kind: 'error', text: 'I can’t see an open Gmail message. Open a compose window and try again.' }); return null; }
      return windows;
    } catch {
      setNotice({ kind: 'error', text: 'Gmail isn’t ready yet. Refresh the Gmail tab once, open a message, and try again.' }); return null;
    }
  }

  async function fillDraft(index?: number) {
    if (!draft) return;
    setLoading(true); setNotice(null);
    try {
      const windows = await findComposeWindows();
      if (!windows) return;
      if (windows.length > 1 && index === undefined) { setComposeWindows(windows); setNotice({ kind: 'info', text: 'Choose which open Gmail message should receive this draft.' }); return; }
      const target = index ?? windows.find((window) => window.active)?.index ?? windows[0]!.index;
      const tab = await activeGmailTab();
      const result = await chrome.tabs.sendMessage(tab!.id!, { type: 'FILL_DRAFT', composeIndex: target, draft }) as ComposeResult;
      if (!result.ok) { setNotice({ kind: 'error', text: result.reason }); return; }
      setComposeWindows(null); setNotice({ kind: 'success', text: 'Draft filled in Gmail. Review it there; sending is always your action.' });
    } catch (error) { setNotice({ kind: 'error', text: messageOf(error) }); }
    finally { setLoading(false); }
  }

  async function parseFormat() {
    if (!formatInstruction.trim()) return;
    setLoading(true); setNotice(null); setAmbiguous(null); setPendingFormat(null);
    try {
      const format = await api.parseFormat(await getInstallationId(), formatInstruction.trim());
      setRemaining(format.requestsRemaining);
      if (format.clarification) { setNotice({ kind: 'info', text: format.clarification }); return; }
      const windows = await findComposeWindows();
      if (!windows) return;
      if (windows.length > 1) { setComposeWindows(windows); setPendingFormat(format); setNotice({ kind: 'info', text: 'Choose which open Gmail message to format.' }); return; }
      const target = windows[0]!.index;
      await applyFormat(target, format);
      setFormatInstruction('');
    } catch (error) { setNotice({ kind: 'error', text: messageOf(error) }); }
    finally { setLoading(false); }
  }

  async function applyFormat(composeIndex: number, format: FormatParseResult, occurrenceIndex?: number) {
    const tab = await activeGmailTab();
    if (!tab?.id) return;
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_FORMAT', composeIndex, format, occurrenceIndex }) as ComposeResult;
    if (result.ok) {
      setNotice({ kind: 'success', text: result.message ?? 'Formatting applied.' });
      setAmbiguous(null); setPendingFormat(null); setComposeWindows(null);
    } else if (result.matches?.length) {
      setAmbiguous(result.matches); setPendingFormat(format); setComposeWindows([{ index: composeIndex, recipient: '', subject: '', active: false }]);
      setNotice({ kind: 'info', text: result.reason });
    } else setNotice({ kind: 'error', text: result.reason });
  }

  async function chooseCompose(composeIndex: number) {
    if (pendingFormat) { await applyFormat(composeIndex, pendingFormat); return; }
    await fillDraft(composeIndex);
  }

  if (!consented) return <main className="shell privacy-screen">
    <Brand />
    <div className="eyebrow">ONE-TIME PRIVACY CHECK</div>
    <h1>Your words stay yours.</h1>
    <p className="muted">When you ask us to sort an email or understand a formatting command, the words in that box are sent to our secure server and processed by an AI model. Email content is not saved by our service.</p>
    <div className="privacy-points"><span>✓ No mailbox access</span><span>✓ No automatic sending</span><span>✓ No saved email text</span></div>
    <button className="primary full" onClick={() => void acceptPrivacy()}>I understand — continue <span>→</span></button>
    <p className="micro">You can clear your local extension data any time in Chrome settings.</p>
  </main>;

  return <main className="shell">
    <header className="topbar"><Brand /><span className="badge"><i /> GMAIL READY</span></header>
    <div className="intro"><div className="eyebrow">VOICE-FIRST EMAIL</div><h1>Say it once.<br /><em>Send it your way.</em></h1><p>Speak a whole email with Wispr Flow. Review the fields, then polish a line by voice.</p></div>
    <section className="card compose-card">
      <div className="section-heading"><div><div className="step">01 / COMPOSE</div><h2>Dictate your email</h2></div><span className="mic-icon">⌁</span></div>
      <label className="field-label" htmlFor="email-transcript">SAY THE RECIPIENT, SUBJECT, AND MESSAGE</label>
      <textarea id="email-transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={'To sohampawar@example.com. Subject: Product update. Message: Hi Sam, here is the latest...'} rows={6} />
      <div className="hint"><span className="key">W</span> Click the box, dictate with Wispr Flow, then sort your words.</div>
      <button className="primary" disabled={loading || !transcript.trim() || remaining === 0} onClick={() => void parseEmail()}>{loading ? <><span className="spinner" /> Working…</> : <>Sort into email fields <span>→</span></>}</button>
      {parsed && draft && <div className="draft-fields">
        <div className="draft-title"><span>REVIEW YOUR DRAFT</span><span className="editable">EDITABLE</span></div>
        <label className="field-label" htmlFor="recipient">TO</label><input id="recipient" value={draft.recipient} onChange={(event) => setDraft({ ...draft, recipient: event.target.value })} />
        <label className="field-label" htmlFor="subject">SUBJECT</label><input id="subject" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
        <label className="field-label" htmlFor="body">MESSAGE</label><textarea id="body" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={6} />
        <button className="secondary full" disabled={loading} onClick={() => void fillDraft()}>Fill the open Gmail draft <span>↗</span></button>
        <p className="micro">We fill the message. You review it and decide whether to send.</p>
      </div>}
    </section>
    <section className="card format-card">
      <div className="section-heading"><div><div className="step">02 / POLISH</div><h2>Format by voice</h2></div><span className="format-icon">Aa</span></div>
      <p className="small-copy">Start with the draft in Gmail. Focus this box, then dictate a command with Wispr Flow.</p>
      <label className="field-label" htmlFor="format-command">FORMATTING COMMAND</label>
      <input ref={formatInput} id="format-command" value={formatInstruction} onChange={(event) => setFormatInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void parseFormat(); }} placeholder="Bold the line I just spoke" />
      <div className="command-examples"><span>“Italic the phrase ‘next Tuesday’”</span><span>“Bold every ‘Report Card’”</span></div>
      <button className="secondary full" disabled={loading || !formatInstruction.trim() || remaining === 0} onClick={() => void parseFormat()}>Apply voice command <span>↗</span></button>
      <div className="shortcut"><span>OPEN THIS BOX WITH</span><kbd>⌥</kbd><kbd>⇧</kbd><kbd>M</kbd></div>
    </section>
    {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '!' : 'i'}</span>{notice.text}</div>}
    {composeWindows && <section className="card chooser"><div className="step">CHOOSE A GMAIL MESSAGE</div>{composeWindows.map((window) => <button key={window.index} className="compose-choice" onClick={() => void chooseCompose(window.index)}><strong>{window.subject || 'New message'}</strong><span>{window.recipient || 'No recipient yet'}{window.active ? ' · active' : ''}</span><b>→</b></button>)}<button className="text-button" onClick={() => { setComposeWindows(null); setPendingFormat(null); }}>Cancel</button></section>}
    {ambiguous && <section className="card chooser"><div className="step">PICK THE MATCH TO CHANGE</div>{ambiguous.map((match) => <button key={match.index} className="match-choice" onClick={() => pendingFormat && composeWindows?.[0] && void applyFormat(composeWindows[0].index, pendingFormat, match.index)}><span>{match.index + 1}</span><strong>…{match.excerpt}…</strong><b>→</b></button>)}</section>}
    <footer><span>Made for Wispr Flow</span><span>{remaining === null ? '25 uses included' : `${remaining} AI uses left`}</span></footer>
    <div className="safety-note">Your email is never sent by this extension.</div>
  </main>;
}

function Brand() { return <div className="brand"><span className="brand-mark">f</span><span>FlowDraft <small>for Gmail</small></span></div>; }
async function activeGmailTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url?.startsWith('https://mail.google.com/')) return undefined;
  return tab;
}
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
