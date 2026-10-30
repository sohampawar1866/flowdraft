import type { ComposeResult, ComposeWindow, EmailDraft } from './messages';
import type { FormatParseResult, VoiceParseResult } from './api';

const COMPOSE_SELECTOR = '[role="dialog"]';
const BODY_SELECTOR = '[aria-label="Message Body"][contenteditable="true"], [contenteditable="true"][g_editable="true"]';
const RECIPIENT_CONTAINER_SELECTOR = '[name="to"]';
const RECIPIENT_INPUT_SELECTOR = 'input[name="to"], input[aria-label="To recipients"], [name="to"] input[role="combobox"]';
// Gmail's recipient chip is a role=option nested under [name="to"]. The
// surrounding PeopleKit listbox attributes vary between Gmail builds, so do
// not make those wrappers part of the selector contract.
const RECIPIENT_CHIP_SELECTOR = '[role="option"]';
const DRAFT_CONFIRMATION_DELAYS_MS = [0, 80, 180, 360, 650];

function composeElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(COMPOSE_SELECTOR)).filter((dialog) =>
    dialog.querySelector(BODY_SELECTOR) && dialog.querySelector(RECIPIENT_CONTAINER_SELECTOR),
  );
}

function fieldText(compose: HTMLElement, selector: string): string {
  const field = compose.querySelector<HTMLInputElement | HTMLElement>(selector);
  return (field as HTMLInputElement | null)?.value ?? field?.textContent?.trim() ?? '';
}

export function listComposeWindows(): ComposeWindow[] {
  const active = document.activeElement;
  return composeElements().map((element, index) => ({
    index,
    recipient: fieldText(element, RECIPIENT_CONTAINER_SELECTOR),
    subject: fieldText(element, 'input[name="subjectbox"], [name="subjectbox"]'),
    active: active instanceof Node && element.contains(active),
  }));
}

function composeAt(index: number): HTMLElement | undefined { return composeElements()[index]; }

function titleOf(compose: HTMLElement): string {
  return compose.querySelector<HTMLElement>('[role="heading"], h1, h2, .aYF')?.textContent?.trim()
    ?? compose.getAttribute('aria-label')
    ?? '';
}

export function isNewBlankCompose(compose: HTMLElement): boolean {
  // Gmail renders the recipient control as a div (name="to"), not an input.
  const recipient = compose.querySelector<HTMLElement>(RECIPIENT_CONTAINER_SELECTOR);
  const recipientInput = compose.querySelector<HTMLInputElement>(RECIPIENT_INPUT_SELECTOR);
  const subject = compose.querySelector<HTMLInputElement>('input[name="subjectbox"], [name="subjectbox"]');
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  const title = titleOf(compose);
  return Boolean(recipient && subject && body)
    && /^(?:compose:\s*)?(?:new message|compose)$/i.test(title)
    && !fieldText(compose, RECIPIENT_CONTAINER_SELECTOR)
    && !recipientInput?.value.trim()
    && !subject?.value.trim()
    && !(body?.textContent ?? '').trim();
}

export function isNewComposeReadyForDictation(compose: HTMLElement): boolean {
  if (!compose.isConnected || compose.dataset.flowdraftCaptureReady !== 'true') return false;
  const recipientInput = compose.querySelector<HTMLInputElement>(RECIPIENT_INPUT_SELECTOR);
  const subject = compose.querySelector<HTMLInputElement>('input[name="subjectbox"], [name="subjectbox"]');
  // The compose was marked capture-ready only while it matched Gmail's blank
  // new-message structure. Gmail may change its hidden heading/title after the
  // body receives dictation, so re-check the editable fields rather than the
  // transient title before applying the parsed result.
  return Boolean(subject)
    && !fieldText(compose, RECIPIENT_CONTAINER_SELECTOR)
    && !recipientInput?.value.trim()
    && !subject?.value.trim();
}

const FOCUS_RETRY_DELAYS_MS = [0, 120, 300, 650];

export function focusNewComposeBody(compose: HTMLElement): boolean {
  if (!compose.isConnected || !isNewBlankCompose(compose)) return false;
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!body) return false;

  body.focus({ preventScroll: true });
  const selection = document.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return document.activeElement === body;
}

export function retryFocusNewCompose(compose: HTMLElement, onFailure: (compose: HTMLElement) => void): () => void {
  if (!isNewBlankCompose(compose) || compose.dataset.flowdraftFocusState) return () => undefined;

  compose.dataset.flowdraftFocusState = 'pending';
  let finished = false;
  const timers: number[] = [];
  const cleanup = (state: 'focused' | 'user' | 'stale' | 'failed') => {
    if (finished) return;
    finished = true;
    timers.forEach((timer) => window.clearTimeout(timer));
    compose.removeEventListener('pointerdown', onUserInteraction, true);
    compose.removeEventListener('keydown', onUserInteraction, true);
    compose.dataset.flowdraftFocusState = state;
  };
  const onUserInteraction = () => cleanup('user');

  compose.addEventListener('pointerdown', onUserInteraction, true);
  compose.addEventListener('keydown', onUserInteraction, true);
  FOCUS_RETRY_DELAYS_MS.forEach((delay, index) => {
    timers.push(window.setTimeout(() => {
      if (finished) return;
      if (!compose.isConnected || !isNewBlankCompose(compose)) {
        cleanup('stale');
        return;
      }
      const focused = focusNewComposeBody(compose);
      if (index !== FOCUS_RETRY_DELAYS_MS.length - 1) return;
      if (focused) cleanup('focused');
      else {
        cleanup('failed');
        onFailure(compose);
      }
    }, delay));
  });
  return () => cleanup('stale');
}

export function showFocusFallback(compose: HTMLElement): HTMLButtonElement | null {
  if (!compose.isConnected || !isNewBlankCompose(compose)) return null;
  const existing = compose.querySelector<HTMLButtonElement>('[data-flowdraft-focus-notice]');
  if (existing) return existing;

  const notice = document.createElement('button');
  notice.type = 'button';
  notice.dataset.flowdraftFocusNotice = 'true';
  notice.setAttribute('aria-live', 'polite');
  notice.textContent = 'FlowDraft couldn’t focus the message body. Click here to focus it, then retry dictation or use Wispr Flow’s Paste Last Transcript shortcut.';
  Object.assign(notice.style, {
    display: 'block',
    width: '100%',
    margin: '8px 0',
    padding: '9px 12px',
    border: '1px solid #b86b4f',
    borderRadius: '6px',
    background: '#fff4ed',
    color: '#4b2417',
    font: '13px/1.4 Arial, sans-serif',
    textAlign: 'left',
    cursor: 'pointer',
  });
  notice.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (focusNewComposeBody(compose)) notice.remove();
  });
  compose.prepend(notice);
  return notice;
}

export function newBlankComposeElements(): HTMLElement[] {
  return composeElements().filter(isNewBlankCompose);
}

export function captureComposeId(compose: HTMLElement): string {
  if (!compose.dataset.flowdraftId) compose.dataset.flowdraftId = crypto.randomUUID();
  return compose.dataset.flowdraftId;
}

export function isFlowDraftDictation(text: string): boolean {
  const addresses = Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi));
  if (!addresses.length) return false;

  // This is a low-cost prefilter, not the parser. Only a new blank compose is
  // considered by the caller; require an address near an email/recipient cue,
  // but deliberately don't require a subject so Bedrock can ask for one.
  return addresses.some((address) => {
    const leadIn = text.slice(Math.max(0, (address.index ?? 0) - 180), address.index);
    const explicitRecipient = /\b(?:to|for|recipient|email address)\s*(?:is|:)?\s*$/i.test(leadIn)
      || /\b(?:send|write|draft|compose|email|mail)\b[\s\S]{0,120}\b(?:to|for)\s*$/i.test(leadIn);
    return explicitRecipient;
  }) || /\b(?:send|write|draft|compose)\b.{0,80}\b(?:email|mail)\b.{0,40}\bto\b/i.test(text);
}

export function isWisprStyleInsertion(event: Event, recentPaste = false): boolean {
  const inputEvent = event as InputEvent;
  return event.type === 'paste' || event.type === 'drop' || recentPaste
    || ['insertFromPaste', 'insertFromDrop', 'insertReplacementText'].includes(inputEvent.inputType ?? '')
    || (typeof inputEvent.data === 'string' && inputEvent.data.trim().length >= 24);
}

export function composeBodyText(body: HTMLElement): string {
  return (body.innerText ?? body.textContent ?? '').trim();
}

export function showComposeVoiceStatus(composeId: string, status: string, text: string): void {
  const compose = composeElements().find((element) => element.dataset.flowdraftId === composeId);
  const body = compose?.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!compose || !body) return;
  let notice = compose.querySelector<HTMLElement>('[data-flowdraft-status]');
  if (!notice) {
    notice = document.createElement('div');
    notice.dataset.flowdraftStatus = 'true';
    notice.setAttribute('role', 'status');
    Object.assign(notice.style, {
      margin: '6px 0', padding: '8px 10px', borderRadius: '6px',
      font: '12px/1.4 Arial, sans-serif',
    });
    body.before(notice);
  }
  notice.textContent = `FlowDraft: ${text}`;
  notice.style.background = status === 'error' ? '#fff0ed' : status === 'success' ? '#edf7ed' : '#f4f3ed';
  notice.style.color = status === 'error' ? '#7b241c' : '#333';
}

export async function applyVoiceDraft(composeId: string, transcript: string, result: VoiceParseResult): Promise<ComposeResult> {
  const compose = composeElements().find((element) => element.dataset.flowdraftId === composeId);
  if (!compose) return { ok: false, reason: 'That Gmail message is no longer open. The dictated text was left unchanged.' };
  if (!result.recipient?.trim() || !result.subject?.trim() || !result.body?.trim()) {
    return { ok: false, reason: result.clarification ?? 'Please include the recipient, subject, and message.' };
  }
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!body || normalizeText(body.innerText ?? body.textContent ?? '') !== normalizeText(transcript)) {
    return { ok: false, reason: 'The Gmail draft changed while I was processing it, so I left it unchanged.' };
  }
  if (!isNewComposeReadyForDictation(compose)) {
    return { ok: false, reason: 'This is no longer a blank new message. I left the Gmail draft unchanged.' };
  }
  const originalBody = body.innerHTML;
  const subject = compose.querySelector<HTMLInputElement>('input[name="subjectbox"], [name="subjectbox"]');
  if (!subject) return { ok: false, reason: 'Gmail changed its compose layout. Your dictated text is still there.' };
  const originalSubject = subject.value;
  // Commit and verify the recipient before touching the subject or body. In
  // v0.1.8 we wrote all three fields first, then rolled them all back when
  // Gmail's private chip markup failed our overly specific check. That made a
  // subject appear briefly and then disappear. Keep the transcript intact if
  // Gmail cannot confirm the recipient.
  const recipientInput = compose.querySelector<HTMLInputElement>(RECIPIENT_INPUT_SELECTOR);
  if (!recipientInput || !commitRecipient(compose, result.recipient)) {
    return { ok: false, reason: 'Gmail did not accept the recipient. I left the subject and dictated message unchanged; check the To field and retry. Nothing was sent.' };
  }
  const recipientConfirmed = await waitForRecipient(compose, result.recipient);
  if (!recipientConfirmed) {
    return { ok: false, reason: 'Gmail did not confirm the recipient. I left the subject and dictated message unchanged. Check the To field; nothing was sent.' };
  }

  const subjectSet = setField(compose, 'input[name="subjectbox"], [name="subjectbox"]', result.subject);
  if (!subjectSet) {
    return { ok: false, reason: 'Gmail accepted the recipient, but its subject field changed. Your dictated message is still there; review the draft. Nothing was sent.' };
  }
  const bodyWasSet = setComposeBody(compose, result.body);
  const applied = await waitForDraftState(compose, result.recipient, result.subject, result.body);
  if (!bodyWasSet || !applied.ok) {
    // The recipient has already been verified. Preserve it and roll back only
    // the fields this operation changed; never remove a known-good recipient
    // chip just because Gmail rendered the body differently.
    const restored = await restoreVoiceCompose(compose, originalBody, originalSubject, transcript, result.recipient);
    const failedFields = bodyWasSet ? unconfirmedFields(applied).filter((field) => field !== 'recipient') : ['message'];
    return { ok: false, reason: restored
      ? `Gmail did not confirm the ${failedFields.join(', ') || 'draft'}. I kept the verified recipient and restored your dictated message; review the draft before retrying. Nothing was sent.`
      : `Gmail did not confirm the ${failedFields.join(', ') || 'draft'}, and I could not verify the message restore. The recipient was confirmed, but review all fields carefully. Nothing was sent.` };
  }

  const index = composeElements().indexOf(compose);
  const skipped: string[] = [];
  for (const command of result.formatting) {
    const applied = applyGmailFormatting(index, { ...command, clarification: null, requestsRemaining: result.requestsRemaining } as FormatParseResult);
    if (!applied.ok) skipped.push(applied.reason);
  }
  return skipped.length
    ? { ok: true, message: `Draft filled. Some formatting was skipped: ${skipped.join(' ')}` }
    : { ok: true, message: 'Draft filled and voice formatting applied. Review it in Gmail before sending.' };
}

function isRecipientCommitted(container: HTMLElement, input: HTMLInputElement, recipient: string): boolean {
  if (input.value.trim()) return false;
  const normalizedRecipient = normalizeEmail(recipient);
  // In live Gmail the chip is a role=option nested several wrappers below
  // [name="to"]. Gmail's rendering can expose the address as chip metadata,
  // or as visible text next to the saved-contact label. The input must be
  // empty in either case so a still-typed autocomplete query is never treated
  // as a committed recipient.
  const chips = Array.from(container.querySelectorAll<HTMLElement>(RECIPIENT_CHIP_SELECTOR));
  if (chips.some((chip) => recipientMetadata(chip).some((value) => normalizeEmail(value) === normalizedRecipient))) return true;

  const renderedAddresses = Array.from(
    (container.innerText ?? container.textContent ?? '').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    (match) => normalizeEmail(match[0]),
  );
  return renderedAddresses.includes(normalizedRecipient);
}

async function restoreVoiceCompose(compose: HTMLElement, originalBody: string, originalSubject: string, transcript: string, confirmedRecipient: string): Promise<boolean> {
  setField(compose, 'input[name="subjectbox"], [name="subjectbox"]', originalSubject);
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  if (body) {
    body.innerHTML = originalBody;
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: composeBodyText(body) }));
    body.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const restored = await waitForDraftState(compose, confirmedRecipient, originalSubject, transcript);
  return restored.ok;
}

function recipientMetadata(chip: HTMLElement): string[] {
  const values: string[] = [];
  for (const node of [chip, ...Array.from(chip.querySelectorAll<HTMLElement>('[data-hovercard-id], [email], [data-email]'))]) {
    for (const attribute of ['data-hovercard-id', 'email', 'data-email']) {
      const value = node.getAttribute(attribute)?.trim();
      if (value) values.push(value);
    }
  }
  return values;
}

function normalizeEmail(value: string): string { return value.trim().replace(/^mailto:/i, '').toLowerCase(); }

async function waitForDraftState(compose: HTMLElement, recipient: string, subject: string, bodyText: string): Promise<DraftStateCheck> {
  let check: DraftStateCheck = { ok: false, recipient: false, subject: false, body: false };
  for (const waitMs of DRAFT_CONFIRMATION_DELAYS_MS) {
    if (waitMs) await delay(waitMs - (DRAFT_CONFIRMATION_DELAYS_MS[DRAFT_CONFIRMATION_DELAYS_MS.indexOf(waitMs) - 1] ?? 0));
    const container = compose.querySelector<HTMLElement>(RECIPIENT_CONTAINER_SELECTOR);
    const input = compose.querySelector<HTMLInputElement>(RECIPIENT_INPUT_SELECTOR);
    const subjectField = compose.querySelector<HTMLInputElement>('input[name="subjectbox"], [name="subjectbox"]');
    const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
    check = {
      ok: false,
      recipient: Boolean(container && input && isRecipientCommitted(container, input, recipient)),
      subject: subjectField?.value === subject,
      body: Boolean(body && normalizeText(composeBodyText(body)) === normalizeText(bodyText)),
    };
    if (check.recipient && check.subject && check.body) return { ...check, ok: true };
  }
  return check;
}

async function waitForRecipient(compose: HTMLElement, recipient: string): Promise<boolean> {
  for (const waitMs of DRAFT_CONFIRMATION_DELAYS_MS) {
    if (waitMs) await delay(waitMs - (DRAFT_CONFIRMATION_DELAYS_MS[DRAFT_CONFIRMATION_DELAYS_MS.indexOf(waitMs) - 1] ?? 0));
    const container = compose.querySelector<HTMLElement>(RECIPIENT_CONTAINER_SELECTOR);
    const input = compose.querySelector<HTMLInputElement>(RECIPIENT_INPUT_SELECTOR);
    if (container && input && isRecipientCommitted(container, input, recipient)) return true;
  }
  return false;
}

interface DraftStateCheck { ok: boolean; recipient: boolean; subject: boolean; body: boolean }

function unconfirmedFields(check: DraftStateCheck): string[] {
  const fields: string[] = [];
  if (!check.recipient) fields.push('recipient');
  if (!check.subject) fields.push('subject');
  if (!check.body) fields.push('message');
  return fields.length ? fields : ['draft'];
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function normalizeText(text: string): string { return text.replace(/\s+/g, ' ').trim(); }

function setField(element: HTMLElement, selectors: string, value: string): boolean {
  const field = element.querySelector<HTMLInputElement | HTMLElement>(selectors);
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    field.textContent = value;
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  }
  return true;
}

function commitRecipient(compose: HTMLElement, recipient: string): boolean {
  const input = compose.querySelector<HTMLInputElement>(RECIPIENT_INPUT_SELECTOR);
  if (!input || !setField(compose, RECIPIENT_INPUT_SELECTOR, recipient)) return false;
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  return true;
}

function setComposeBody(compose: HTMLElement, bodyText: string): boolean {
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!body) return false;
  body.focus();
  body.replaceChildren(...bodyText.split('\n').map((line, lineIndex) => {
    const paragraph = document.createElement('div');
    if (line) paragraph.textContent = line;
    else paragraph.append(document.createElement('br'));
    if (lineIndex === 0 && !line) paragraph.setAttribute('data-empty', 'true');
    return paragraph;
  }));
  body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: bodyText }));
  body.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function fillComposeWindow(index: number, draft: EmailDraft): ComposeResult {
  const compose = composeAt(index);
  if (!compose) return { ok: false, reason: 'That compose window is no longer open. Reopen the draft picker and try again.' };
  const recipientSet = commitRecipient(compose, draft.recipient);
  const subjectSet = setField(compose, 'input[name="subjectbox"], [name="subjectbox"]', draft.subject);
  const bodySet = setComposeBody(compose, draft.body);
  if (!recipientSet || !subjectSet || !bodySet) return { ok: false, reason: 'Gmail changed its compose layout. Reload Gmail and try again.' };
  return { ok: true, message: 'Draft filled. Review it in Gmail before sending.' };
}

function textMap(root: HTMLElement): { text: string; points: Array<{ node: Text; start: number; end: number }> } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  const points: Array<{ node: Text; start: number; end: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.textContent ?? '';
    points.push({ node, start: text.length, end: text.length + value.length });
    text += value;
    const parentBlock = node.parentElement?.closest('div,p,li');
    if (parentBlock && parentBlock.nextSibling) text += '\n';
  }
  return { text, points };
}

function rangeForOffsets(root: HTMLElement, start: number, end: number): Range | undefined {
  const points = textMap(root).points;
  const startPoint = points.find((point) => start >= point.start && start < point.end);
  const endPoint = points.find((point) => end > point.start && end <= point.end);
  if (!startPoint || !endPoint) return undefined;
  const range = document.createRange();
  range.setStart(startPoint.node, start - startPoint.start);
  range.setEnd(endPoint.node, end - endPoint.start);
  return range;
}

function currentParagraph(body: HTMLElement): HTMLElement | undefined {
  const selectionNode = document.getSelection()?.anchorNode;
  const selected = selectionNode instanceof Element ? selectionNode : selectionNode?.parentElement;
  const selectedParagraph = selected?.closest<HTMLElement>('div,p,li');
  if (selectedParagraph && body.contains(selectedParagraph)) return selectedParagraph;
  const blocks = Array.from(body.querySelectorAll<HTMLElement>('div,p,li')).filter((el) => el.textContent?.trim());
  return blocks.at(-1);
}

function paragraphForPhrase(body: HTMLElement, phrase: string): HTMLElement[] {
  return Array.from(body.querySelectorAll<HTMLElement>('div,p,li')).filter((el) =>
    el.textContent?.includes(phrase) && !Array.from(el.children).some((child) => child.textContent?.includes(phrase)),
  );
}

export function applyGmailFormatting(index: number, format: FormatParseResult, occurrenceIndex?: number): ComposeResult {
  const compose = composeAt(index);
  const body = compose?.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!body) return { ok: false, reason: 'The selected Gmail draft is no longer available.' };
  const target = format.target;
  if (target.kind === 'last-paragraph') {
    const paragraph = currentParagraph(body);
    if (!paragraph) return { ok: false, reason: 'There is no message paragraph to format yet.' };
    return executeFormat(body, paragraph, format.action);
  }

  const { text, points } = textMap(body);
  const matches: Array<{ start: number; end: number; excerpt: string }> = [];
  let cursor = 0;
  while (true) {
    const start = text.indexOf(target.text, cursor);
    if (start < 0) break;
    const before = text.slice(0, start).split('\n').at(-1) ?? '';
    const after = text.slice(start + target.text.length).split('\n')[0] ?? '';
    matches.push({ start, end: start + target.text.length, excerpt: `${before.slice(-32)}${target.text}${after.slice(0, 32)}` });
    cursor = start + Math.max(1, target.text.length);
  }
  if (!matches.length) return { ok: false, reason: `I couldn't find “${target.text}” in the Gmail message.` };
  if (!target.all && matches.length > 1 && occurrenceIndex === undefined) {
    return { ok: false, reason: 'That phrase appears more than once. Choose the occurrence to format.', matches: matches.map((match, matchIndex) => ({ index: matchIndex, excerpt: match.excerpt })) };
  }
  const chosen = target.all ? matches : [matches[occurrenceIndex ?? 0]].filter((match): match is NonNullable<typeof match> => Boolean(match));
  if (!chosen.length) return { ok: false, reason: 'That occurrence is no longer available. Try the command again.' };
  const blocks = target.all || format.action === 'center' || format.action === 'bullets'
    ? chosen.map((match) => {
        const point = points.find((entry) => match.start >= entry.start && match.start < entry.end);
        return point?.node.parentElement?.closest<HTMLElement>('div,p,li');
      }).filter((el): el is HTMLElement => Boolean(el))
    : [];
  const originalHtml = body.innerHTML;
  if (format.action === 'center' || format.action === 'bullets') {
    const uniqueBlocks = Array.from(new Set(blocks));
    if (!uniqueBlocks.length) return { ok: false, reason: 'I found the words, but not a paragraph I can safely format.' };
    for (const block of uniqueBlocks) {
      const applied = executeFormat(body, block, format.action);
      if (!applied.ok) {
        body.innerHTML = originalHtml;
        body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: body.textContent ?? '' }));
        return applied;
      }
    }
    return { ok: true, message: `${format.action === 'bullets' ? 'Bullet list' : 'Alignment'} updated.` };
  }
  const ranges = chosen.map((match) => rangeForOffsets(body, match.start, match.end)).filter((range): range is Range => Boolean(range));
  if (!ranges.length) return { ok: false, reason: 'I found the words, but could not select them safely.' };
  for (const range of ranges.reverse()) {
    const selection = document.getSelection();
    if (!selection) continue;
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand(format.action)) {
      body.innerHTML = originalHtml;
      body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: body.textContent ?? '' }));
      return { ok: false, reason: 'Gmail could not apply that formatting. The text was left unchanged.' };
    }
  }
  body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'format' }));
  body.focus();
  return { ok: true, message: `${format.action === 'bold' ? 'Bold' : 'Italic'} applied.` };
}

function executeFormat(body: HTMLElement, paragraph: HTMLElement, action: FormatParseResult['action']): ComposeResult {
  body.focus();
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const command = action === 'center' ? 'justifyCenter' : action === 'bullets' ? 'insertUnorderedList' : action;
  const applied = document.execCommand(command);
  if (!applied) return { ok: false, reason: 'Gmail could not apply that formatting. The text was left unchanged.' };
  body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'format' }));
  body.focus();
  return { ok: true, message: `${action === 'bullets' ? 'Bullet list' : action === 'center' ? 'Center alignment' : action} applied.` };
}
