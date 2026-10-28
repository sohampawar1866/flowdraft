import type { ComposeResult, ComposeWindow, EmailDraft } from './messages';
import type { FormatParseResult, VoiceParseResult } from './api';

const COMPOSE_SELECTOR = '[role="dialog"]';
const BODY_SELECTOR = '[aria-label="Message Body"][contenteditable="true"], [contenteditable="true"][g_editable="true"]';

function composeElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(COMPOSE_SELECTOR)).filter((dialog) =>
    dialog.querySelector(BODY_SELECTOR) && dialog.querySelector('input[name="to"], [name="to"]'),
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
    recipient: fieldText(element, 'input[name="to"], [name="to"]'),
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
  const recipient = compose.querySelector<HTMLInputElement>('input[name="to"], [name="to"]');
  const subject = compose.querySelector<HTMLInputElement>('input[name="subjectbox"], [name="subjectbox"]');
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  const title = titleOf(compose);
  return Boolean(recipient && subject && body)
    && /^(new message|compose)$/i.test(title)
    && !recipient?.value.trim()
    && !subject?.value.trim()
    && !(body?.textContent ?? '').trim();
}

export function prepareNewComposeForDictation(): void {
  for (const compose of composeElements()) {
    if (!isNewBlankCompose(compose)) continue;
    const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
    if (!body || compose.dataset.flowdraftFocused === 'true') continue;
    compose.dataset.flowdraftFocused = 'true';
    compose.dataset.flowdraftCaptureReady = 'true';
    body.focus();
  }
}

export function newBlankComposeElements(): HTMLElement[] {
  return composeElements().filter(isNewBlankCompose);
}

export function captureComposeId(compose: HTMLElement): string {
  if (!compose.dataset.flowdraftId) compose.dataset.flowdraftId = crypto.randomUUID();
  return compose.dataset.flowdraftId;
}

export function isFlowDraftDictation(text: string): boolean {
  return /\bhey\s+wispr\b/i.test(text)
    || /^\s*(?:to|recipient)\b[\s\S]{1,500}\bsubject\b[\s\S]{1,500}\b(?:message|body)\b/i.test(text);
}

export function applyVoiceDraft(composeId: string, transcript: string, result: VoiceParseResult): ComposeResult {
  const compose = composeElements().find((element) => element.dataset.flowdraftId === composeId);
  if (!compose) return { ok: false, reason: 'That Gmail message is no longer open. The dictated text was left unchanged.' };
  if (!result.recipient || result.subject === null || result.body === null) {
    return { ok: false, reason: result.clarification ?? 'Please include the recipient, subject, and message.' };
  }
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!body || normalizeText(body.innerText ?? body.textContent ?? '') !== normalizeText(transcript)) {
    return { ok: false, reason: 'The Gmail draft changed while I was processing it, so I left it unchanged.' };
  }
  const index = composeElements().indexOf(compose);
  const filled = fillComposeWindow(index, { recipient: result.recipient, subject: result.subject, body: result.body });
  if (!filled.ok) return filled;

  const skipped: string[] = [];
  for (const command of result.formatting) {
    const applied = applyGmailFormatting(index, { ...command, clarification: null, requestsRemaining: result.requestsRemaining } as FormatParseResult);
    if (!applied.ok) skipped.push(applied.reason);
  }
  return skipped.length
    ? { ok: true, message: `Draft filled. Some formatting was skipped: ${skipped.join(' ')}` }
    : { ok: true, message: 'Draft filled and voice formatting applied. Review it in Gmail before sending.' };
}

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

export function fillComposeWindow(index: number, draft: EmailDraft): ComposeResult {
  const compose = composeAt(index);
  if (!compose) return { ok: false, reason: 'That compose window is no longer open. Reopen the draft picker and try again.' };
  const recipientSet = setField(compose, 'input[name="to"], [name="to"]', draft.recipient);
  const recipientField = compose.querySelector<HTMLInputElement>('input[name="to"]');
  if (recipientField) {
    recipientField.focus();
    recipientField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    recipientField.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }
  const subjectSet = setField(compose, 'input[name="subjectbox"], [name="subjectbox"]', draft.subject);
  const body = compose.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!recipientSet || !subjectSet || !body) return { ok: false, reason: 'Gmail changed its compose layout. Reload Gmail and try again.' };
  body.focus();
  body.replaceChildren(...draft.body.split('\n').map((line, lineIndex) => {
    const paragraph = document.createElement('div');
    if (line) paragraph.textContent = line;
    else paragraph.append(document.createElement('br'));
    if (lineIndex === 0 && !line) paragraph.setAttribute('data-empty', 'true');
    return paragraph;
  }));
  body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: draft.body }));
  body.dispatchEvent(new Event('change', { bubbles: true }));
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
  if (format.action === 'center' || format.action === 'bullets') {
    const uniqueBlocks = Array.from(new Set(blocks));
    if (!uniqueBlocks.length) return { ok: false, reason: 'I found the words, but not a paragraph I can safely format.' };
    for (const block of uniqueBlocks) executeFormat(body, block, format.action);
    return { ok: true, message: `${format.action === 'bullets' ? 'Bullet list' : 'Alignment'} updated.` };
  }
  const ranges = chosen.map((match) => rangeForOffsets(body, match.start, match.end)).filter((range): range is Range => Boolean(range));
  if (!ranges.length) return { ok: false, reason: 'I found the words, but could not select them safely.' };
  for (const range of ranges.reverse()) {
    const selection = document.getSelection();
    if (!selection) continue;
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand(format.action === 'bold' ? 'bold' : 'italic');
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
  if (!applied) return { ok: false, reason: 'Gmail did not apply that formatting. Try selecting the text and use Gmail’s toolbar.' };
  body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'format' }));
  body.focus();
  return { ok: true, message: `${action === 'bullets' ? 'Bullet list' : action === 'center' ? 'Center alignment' : action} applied.` };
}
