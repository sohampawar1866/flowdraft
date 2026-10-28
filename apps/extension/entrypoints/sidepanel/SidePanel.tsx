import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getInstallationId } from '@/lib/identity';
import type { VoiceStatusMessage } from '@/lib/messages';

type Notice = { kind: 'success' | 'error' | 'info'; text: string };

export default function SidePanel() {
  const [consented, setConsented] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);

  useEffect(() => {
    void chrome.storage.local.get('privacyAcknowledged').then((stored) => {
      const accepted = stored.privacyAcknowledged === true;
      setConsented(accepted);
      if (accepted) void refreshQuota();
    });
    const listener = (message: unknown) => {
      if (!isVoiceStatus(message)) return;
      if (typeof message.requestsRemaining === 'number') setRemaining(message.requestsRemaining);
      const kind = message.status === 'success' ? 'success' : message.status === 'error' ? 'error' : 'info';
      setNotice({ kind, text: message.text });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function refreshQuota() {
    setLoadingQuota(true);
    try {
      const usage = await api.getUsage(await getInstallationId());
      setRemaining(usage.requestsRemaining);
      await chrome.storage.local.set({ requestsRemaining: usage.requestsRemaining });
    } catch {
      const cached = await chrome.storage.local.get('requestsRemaining');
      if (typeof cached.requestsRemaining === 'number') setRemaining(cached.requestsRemaining);
      setNotice({ kind: 'error', text: 'Could not refresh your quota. Your last saved count is shown if available.' });
    } finally { setLoadingQuota(false); }
  }

  async function acceptPrivacy() {
    await chrome.storage.local.set({ privacyAcknowledged: true });
    setConsented(true);
    void refreshQuota();
  }

  if (!consented) return <main className="shell privacy-screen">
    <Brand />
    <div className="eyebrow">ONE-TIME PRIVACY CHECK</div>
    <h1>Your words stay yours.</h1>
    <p className="muted">When you dictate a complete email in Gmail, FlowDraft sends the recognized text—including any “Hey Wispr” formatting requests—to our secure server and an AI model so it can fill and format the draft. FlowDraft does not save email text, access your mailbox, or send messages.</p>
    <div className="privacy-points"><span>✓ Dictation text is processed, not stored</span><span>✓ No mailbox scanning</span><span>✓ You send from Gmail yourself</span></div>
    <button className="primary full" onClick={() => void acceptPrivacy()}>I understand — continue <span>→</span></button>
    <p className="micro">Clear your extension data in Chrome settings to reset this notice.</p>
  </main>;

  return <main className="shell">
    <header className="topbar"><Brand /><span className="badge"><i /> GMAIL READY</span></header>
    <div className="intro"><div className="eyebrow">VOICE-FIRST EMAIL</div><h1>Say it once.<br /><em>Review it in Gmail.</em></h1><p>Keep the Gmail message body focused and dictate naturally with Wispr Flow.</p></div>

    <section className="card quota-card" aria-live="polite">
      <div className="step">YOUR FREE AI ALLOWANCE</div>
      <strong className="quota-count">{remaining === null ? (loadingQuota ? 'Checking…' : '— of 25') : `${remaining} of 25`}</strong>
      <span className="small-copy">requests remaining on this installation</span>
      <button className="text-button" onClick={() => void refreshQuota()} disabled={loadingQuota}>Refresh count</button>
    </section>

    <section className="card">
      <div className="section-heading"><div><div className="step">01 / DICTATE</div><h2>Start a new email</h2></div><span className="mic-icon">⌁</span></div>
      <ol className="steps">
        <li>Open a new, blank Gmail compose. FlowDraft will focus the message body.</li>
        <li>Hold <kbd>Fn</kbd> and speak naturally. For example: “Send the mail to sam@example.com. The subject is Project update. In the main message, say…”</li>
        <li>Release Fn. FlowDraft sorts the draft into Gmail’s fields.</li>
      </ol>
    </section>

    <section className="card">
      <div className="section-heading"><div><div className="step">02 / FORMAT WHILE YOU SPEAK</div><h2>Say “Hey Wispr”</h2></div><span className="format-icon">Aa</span></div>
      <p className="small-copy">In the same dictation, say “Hey Wispr, make the heading I just said bold.” You can name a phrase or ask to make every matching phrase bold or italic. You can also center a paragraph or turn it into bullets.</p>
      <p className="micro">Formatting is applied after you release Fn. Review the completed draft and send it using Gmail.</p>
    </section>

    {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '!' : 'i'}</span>{notice.text}</div>}
    <footer><span>Made for Wispr Flow</span><span>{remaining === null ? '25 AI uses per installation' : `${remaining} of 25 uses left`}</span></footer>
    <div className="safety-note">Your email is never sent by this extension.</div>
  </main>;
}

function Brand() { return <div className="brand"><span className="brand-mark">f</span><span>FlowDraft <small>for Gmail</small></span></div>; }
function isVoiceStatus(value: unknown): value is VoiceStatusMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'VOICE_STATUS'
    && 'status' in value && (value.status === 'processing' || value.status === 'success' || value.status === 'clarification' || value.status === 'error')
    && 'text' in value && typeof value.text === 'string';
}
