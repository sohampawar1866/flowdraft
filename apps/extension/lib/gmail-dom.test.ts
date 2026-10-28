// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGmailFormatting, applyVoiceDraft, captureComposeId, fillComposeWindow, isFlowDraftDictation, isNewBlankCompose, listComposeWindows, prepareNewComposeForDictation } from './gmail-dom';
import type { VoiceParseResult } from './api';

function createCompose({ recipient = '', subject = '', body = '' } = {}) {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML = `<div role="heading">New Message</div><input name="to" value="${recipient}"><input name="subjectbox" value="${subject}"><div aria-label="Message Body" contenteditable="true"></div><button>Send</button>`;
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
    expect(dialog.querySelector<HTMLInputElement>('input[name="to"]')!.value).toBe('sam@example.com');
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

  it('auto-focuses the body of a new blank compose and leaves non-new messages alone', () => {
    const dialog = createCompose();
    expect(isNewBlankCompose(dialog)).toBe(true);
    prepareNewComposeForDictation();
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Message Body"]'));

    const reply = createCompose();
    reply.querySelector('[role="heading"]')!.textContent = 'Reply';
    expect(isNewBlankCompose(reply)).toBe(false);
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
    expect(dialog.querySelector<HTMLInputElement>('input[name="to"]')!.value).toBe('sam@example.com');
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
