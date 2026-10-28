// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGmailFormatting, applyVoiceDraft, captureComposeId, fillComposeWindow, focusNewComposeBody, isFlowDraftDictation, isNewBlankCompose, listComposeWindows, retryFocusNewCompose, showFocusFallback } from './gmail-dom';
import type { VoiceParseResult } from './api';

function createCompose({ recipient = '', subject = '', body = '' } = {}) {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML = `<div role="heading">Compose: New Message</div><div name="to" aria-label="To"><input role="combobox" aria-label="To recipients"></div><input name="subjectbox" value="${subject}"><div aria-label="Message Body" contenteditable="true"></div><button>Send</button>`;
  const recipientContainer = dialog.querySelector<HTMLElement>('[name="to"]')!;
  const recipientInput = dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')!;
  if (recipient) {
    const chip = document.createElement('span');
    chip.dataset.recipientChip = 'true';
    chip.textContent = recipient;
    recipientContainer.prepend(chip);
  }
  recipientInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !recipientInput.value) return;
    const chip = document.createElement('span');
    chip.dataset.recipientChip = 'true';
    chip.textContent = recipientInput.value;
    recipientContainer.insertBefore(chip, recipientInput);
    recipientInput.value = '';
  });
  const messageBody = dialog.querySelector('[aria-label="Message Body"]')!;
  for (const line of body.split('\n')) {
    const paragraph = document.createElement('div');
    paragraph.textContent = line;
    messageBody.append(paragraph);
  }
  document.body.append(dialog);
  return dialog;
}

beforeEach(() => { document.body.replaceChildren(); });

describe('Gmail compose bridge', () => {
  it('fills the chosen compose fields and never clicks Send', () => {
    const dialog = createCompose();
    const send = dialog.querySelector('button')!;
    const click = vi.spyOn(send, 'click');
    const result = fillComposeWindow(0, { recipient: 'sam@example.com', subject: 'Update', body: 'First line\nSecond line' });
    expect(result.ok).toBe(true);
    expect(dialog.querySelector('[name="to"] [data-recipient-chip]')!.textContent).toBe('sam@example.com');
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')!.value).toBe('');
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')!.value).toBe('Update');
    expect(dialog.querySelector('[aria-label="Message Body"]')!.textContent).toContain('First line');
    expect(dialog.querySelector('[aria-label="Message Body"]')!.textContent).toContain('Second line');
    expect(click).not.toHaveBeenCalled();
  });

  it('lists multiple compose windows and indicates the currently focused one', () => {
    createCompose({ recipient: 'one@example.com' });
    const activeCompose = createCompose({ recipient: 'two@example.com' });
    activeCompose.querySelector<HTMLInputElement>('input[name="subjectbox"]')!.focus();
    expect(listComposeWindows()).toEqual([
      { index: 0, recipient: 'one@example.com', subject: '', active: false },
      { index: 1, recipient: 'two@example.com', subject: '', active: true },
    ]);
  });

  it('does not change content when a phrase is missing or appears ambiguously', () => {
    const dialog = createCompose({ body: 'Report Card is ready. Please review the Report Card.' });
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const before = body.innerHTML;
    const format = { action: 'bold', target: { kind: 'phrase', text: 'Report Card', all: false }, clarification: null, requestsRemaining: 2 } as const;
    const missing = applyGmailFormatting(0, { ...format, target: { ...format.target, text: 'Absent phrase' } });
    const ambiguous = applyGmailFormatting(0, format);
    expect(missing.ok).toBe(false);
    expect(ambiguous.ok).toBe(false);
    if (ambiguous.ok) throw new Error('Expected a repeated target to require clarification.');
    expect(ambiguous.matches).toHaveLength(2);
    expect(body.innerHTML).toBe(before);
  });

  it('formats an exact phrase once and formats every match only when explicitly requested', () => {
    const dialog = createCompose({ body: 'Report Card is ready. Please review the Report Card.' });
    const observed: string[] = [];
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => { observed.push(document.getSelection()?.toString() ?? ''); return true; }) });
    const single = { action: 'bold', target: { kind: 'phrase', text: 'Report Card', all: false }, clarification: null, requestsRemaining: 2 } as const;
    const all = { ...single, target: { ...single.target, all: true } } as const;
    expect(applyGmailFormatting(0, single, 1).ok).toBe(true);
    expect(observed).toEqual(['Report Card']);
    observed.length = 0;
    expect(applyGmailFormatting(0, all).ok).toBe(true);
    expect(observed).toHaveLength(2);
    expect(observed.every((text) => text === 'Report Card')).toBe(true);
    expect(dialog.querySelector('[aria-label="Message Body"]')!.textContent).toContain('Report Card');
  });

  it('targets the last paragraph for a recent-line command', () => {
    createCompose({ body: 'Earlier paragraph.\nThe line I just spoke.' });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) });
    const format = { action: 'center', target: { kind: 'last-paragraph' }, clarification: null, requestsRemaining: 2 } as const;
    expect(applyGmailFormatting(0, format).ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('justifyCenter');
    expect(document.getSelection()?.toString()).toBe('The line I just spoke.');
  });

  it('reports when the requested Gmail draft is not available', () => {
    expect(fillComposeWindow(0, { recipient: 'a@example.com', subject: 'Hi', body: 'Hello' })).toEqual({
      ok: false, reason: 'That compose window is no longer open. Reopen the draft picker and try again.',
    });
  });

  it('recognizes only clear FlowDraft email cues or the reserved spoken command marker', () => {
    expect(isFlowDraftDictation('To sam@example.com. Subject: Update. Message: Hello.')).toBe(true);
    expect(isFlowDraftDictation('Quarterly update. Hey Wispr, make that bold.')).toBe(true);
    expect(isFlowDraftDictation('Please send me the project notes.')).toBe(false);
  });

  it('waits for Gmail to mount all fields before a new compose is eligible for focus', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<div role="heading">Compose: New Message</div><div name="to"><input role="combobox" aria-label="To recipients"></div>';
    document.body.append(dialog);
    expect(isNewBlankCompose(dialog)).toBe(false);
    dialog.insertAdjacentHTML('beforeend', '<input name="subjectbox"><div aria-label="Message Body" contenteditable="true"></div>');
    expect(isNewBlankCompose(dialog)).toBe(true);
    expect(focusNewComposeBody(dialog)).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Message Body"]'));
  });

  it('retries focus after Gmail takes focus back and confirms the body is active', () => {
    const dialog = createCompose();
    expect(isNewBlankCompose(dialog)).toBe(true);
    vi.useFakeTimers();
    retryFocusNewCompose(dialog, vi.fn());
    vi.advanceTimersByTime(0);
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    expect(document.activeElement).toBe(body);
    dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')!.focus();
    vi.advanceTimersByTime(120);
    expect(document.activeElement).toBe(body);
    vi.advanceTimersByTime(530);
    expect(dialog.dataset.flowdraftFocusState).toBe('focused');
    vi.useRealTimers();
  });

  it('stops focus retries after the user interacts with the compose', () => {
    const dialog = createCompose();
    const recipient = dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')!;
    const onFailure = vi.fn();
    vi.useFakeTimers();
    retryFocusNewCompose(dialog, onFailure);
    recipient.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    vi.runAllTimers();
    expect(document.activeElement).not.toBe(dialog.querySelector('[aria-label="Message Body"]'));
    expect(dialog.dataset.flowdraftFocusState).toBe('user');
    expect(onFailure).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('shows a clickable Gmail fallback if focus fails and focuses the body on click', () => {
    const dialog = createCompose();
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const nativeFocus = body.focus.bind(body);
    const onFailure = vi.fn(showFocusFallback);
    vi.useFakeTimers();
    body.focus = () => undefined;
    retryFocusNewCompose(dialog, onFailure);
    vi.runAllTimers();
    expect(onFailure).toHaveBeenCalledWith(dialog);
    const notice = dialog.querySelector<HTMLButtonElement>('[data-flowdraft-focus-notice]')!;
    expect(notice.textContent).toContain('Paste Last Transcript');
    body.focus = nativeFocus;
    notice.click();
    expect(document.activeElement).toBe(body);
    expect(dialog.querySelector('[data-flowdraft-focus-notice]')).toBeNull();
    vi.useRealTimers();
  });

  it('never auto-focuses replies or nonblank composers', () => {
    const reply = createCompose();
    reply.querySelector('[role="heading"]')!.textContent = 'Reply';
    expect(isNewBlankCompose(reply)).toBe(false);
    const nonblank = createCompose({ subject: 'Already started' });
    const onFailure = vi.fn();
    vi.useFakeTimers();
    retryFocusNewCompose(reply, onFailure);
    retryFocusNewCompose(nonblank, onFailure);
    vi.runAllTimers();
    expect(reply.dataset.flowdraftFocusState).toBeUndefined();
    expect(nonblank.dataset.flowdraftFocusState).toBeUndefined();
    expect(onFailure).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('routes one dictation and applies inline formatting after verifying the transcript is unchanged', () => {
    const dialog = createCompose();
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'To sam@example.com. Subject: Update. Message: Quarterly update';
    body.textContent = transcript;
    const composeId = captureComposeId(dialog);
    const format = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: format });
    const response = {
      recipient: 'sam@example.com',
      subject: 'Update',
      body: 'Quarterly update',
      formatting: [{ action: 'bold', target: { kind: 'phrase', text: 'Quarterly update', all: false } }],
      clarification: null,
      requestsRemaining: 24,
    } satisfies VoiceParseResult;
    const result = applyVoiceDraft(composeId, transcript, response);
    expect(result.ok).toBe(true);
    expect(dialog.querySelector('[name="to"] [data-recipient-chip]')!.textContent).toBe('sam@example.com');
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')!.value).toBe('Update');
    expect(body.textContent).toContain('Quarterly update');
    expect(body.textContent).not.toContain('Hey Wispr');
    expect(format).toHaveBeenCalledWith('bold');
  });

  it('leaves Gmail untouched if the user changed the pasted text during AI processing', () => {
    const dialog = createCompose();
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    body.textContent = 'Edited while processing';
    const response = {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult;
    const before = dialog.innerHTML;
    const result = applyVoiceDraft(captureComposeId(dialog), 'Original transcript', response);
    expect(result.ok).toBe(false);
    expect(dialog.innerHTML).toBe(before);
  });
});
