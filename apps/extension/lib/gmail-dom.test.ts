// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGmailFormatting, applyVoiceDraft, captureComposeId, fillComposeWindow, focusNewComposeBody, isFlowDraftDictation, isNewBlankCompose, isNewComposeReadyForDictation, isWisprStyleInsertion, listComposeWindows, retryFocusNewCompose, showComposeVoiceStatus, showFocusFallback } from './gmail-dom';
import type { VoiceParseResult } from './api';

function createCompose({ recipient = '', subject = '', body = '', recipientDisplay = '', recipientCommitDelayMs = 0, recipientCommitAs = '' }: { recipient?: string; subject?: string; body?: string; recipientDisplay?: string; recipientCommitDelayMs?: number; recipientCommitAs?: string } = {}) {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  // Sanitized fixture based on the live Gmail PeopleKit structure: the
  // recipient chip and input share a nested wrapper under [name="to"].
  dialog.innerHTML = `<div role="heading">Compose: New Message</div><div name="to" aria-label="To"><div class="aUy"><div class="afp"><div class="afx" role="listbox"><div class="agh"><div class="agb"></div></div></div><div class="aH9"><input role="combobox" aria-label="To recipients"></div></div></div></div><input name="subjectbox" value="${subject}"><div aria-label="Message Body" contenteditable="true"></div><button>Send</button>`;
  const recipientContainer = dialog.querySelector<HTMLElement>('[name="to"]')!;
  const chipList = dialog.querySelector<HTMLElement>('.agb')!;
  const recipientInput = dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')!;
  if (recipient) {
    const chip = createRecipientChip(recipient, recipientDisplay || recipient);
    chipList.append(chip);
  }
  recipientInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !recipientInput.value) return;
    const commit = () => {
      const chip = createRecipientChip(recipientCommitAs || recipientInput.value, recipientDisplay || recipientInput.value);
      chipList.append(chip);
      recipientInput.value = '';
    };
    if (recipientCommitDelayMs) window.setTimeout(commit, recipientCommitDelayMs);
    else commit();
  });
  recipientInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace' || recipientInput.value) return;
    const chips = chipList.querySelectorAll('[role="option"]');
    chips.item(chips.length - 1)?.remove();
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

function createRecipientChip(email: string, display: string): HTMLElement {
  const chip = document.createElement('div');
  chip.setAttribute('role', 'option');
  chip.setAttribute('data-hovercard-id', email);
  chip.setAttribute('data-name', display);
  chip.innerHTML = `<div class="afT"><div class="afZ"><span>${display}</span></div></div><div aria-hidden="true" aria-label="Press delete to remove this chip"></div>`;
  return chip;
}

beforeEach(() => { document.body.replaceChildren(); });

describe('Gmail compose bridge', () => {
  it('recognizes paste or one large inserted transcript, but not ordinary keystrokes', () => {
    expect(isWisprStyleInsertion(new Event('paste'))).toBe(true);
    expect(isWisprStyleInsertion(new InputEvent('beforeinput', { inputType: 'insertFromPaste' }))).toBe(true);
    expect(isWisprStyleInsertion(new InputEvent('beforeinput', { inputType: 'insertText', data: 'A long dictated sentence inserted at once.' }))).toBe(true);
    expect(isWisprStyleInsertion(new InputEvent('beforeinput', { inputType: 'insertText', data: 'a' }))).toBe(false);
    expect(isWisprStyleInsertion(new InputEvent('input', { inputType: 'insertText', data: 'a' }), true)).toBe(true);
  });

  it('fills the chosen compose fields and never clicks Send', () => {
    const dialog = createCompose();
    const send = dialog.querySelector('button')!;
    const click = vi.spyOn(send, 'click');
    const result = fillComposeWindow(0, { recipient: 'sam@example.com', subject: 'Update', body: 'First line\nSecond line' });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')!.textContent).toContain('sam@example.com');
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

  it.each([
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['center', 'justifyCenter'],
    ['bullets', 'insertUnorderedList'],
  ] as const)('checks whether Gmail successfully applies %s formatting', (action, command) => {
    createCompose({ body: 'Project heading' });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) });
    const format = { action, target: { kind: 'phrase', text: 'Project heading', all: false }, clarification: null, requestsRemaining: 2 } as const;
    expect(applyGmailFormatting(0, format).ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith(command);
  });

  it('reports a failed edit and rolls back any partial formatting change', () => {
    const dialog = createCompose({ body: 'Project heading' });
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const before = body.innerHTML;
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
    const format = { action: 'bold', target: { kind: 'phrase', text: 'Project heading', all: false }, clarification: null, requestsRemaining: 2 } as const;
    const result = applyGmailFormatting(0, format);
    expect(result.ok).toBe(false);
    expect(body.innerHTML).toBe(before);
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

  it('recognizes natural email intent without requiring a subject cue, and ignores ordinary text', () => {
    expect(isFlowDraftDictation('To sam@example.com. Subject: Update. Message: Hello.')).toBe(true);
    expect(isFlowDraftDictation('Hey, send the mail to soham.pawar182006@gmail.com, and the subject is regarding project update for digital communication. In the main message, mention that the dates have been postponed by 2 weeks, so we have a lot of time for that. We can do it later, and let\'s prepare for the practical lab exam instead of that, to the team by Soham.')).toBe(true);
    expect(isFlowDraftDictation('To sam@example.com, subject is Project update, and in the main message mention the new date. Hey Wispr, make the heading I just said bold.')).toBe(true);
    expect(isFlowDraftDictation('Hey, send this mail to sam@example.com. The topic is regarding project submission. In the main message, mention the update. Hey Wispr Flow, make the heading bold.')).toBe(true);
    expect(isFlowDraftDictation('Please send the details to sam@example.com.')).toBe(true);
    expect(isFlowDraftDictation('Quarterly update. Hey Wispr, make that bold.')).toBe(false);
    expect(isFlowDraftDictation('To the design team. Subject: Update. Message: Please review.')).toBe(false);
    expect(isFlowDraftDictation('Please send me the project notes.')).toBe(false);
    expect(isFlowDraftDictation('My email is sam@example.com, here is the note.')).toBe(false);
  });

  it('only accepts automatic dictation into a compose whose recipient and subject are still blank', () => {
    const compose = createCompose();
    compose.dataset.flowdraftCaptureReady = 'true';
    compose.querySelector('[aria-label="Message Body"]')!.textContent = 'Dictated transcript';
    compose.querySelector('[role="heading"]')!.textContent = 'Draft saved';
    expect(isNewComposeReadyForDictation(compose)).toBe(true);
    compose.querySelector<HTMLInputElement>('input[name="subjectbox"]')!.value = 'Already started';
    expect(isNewComposeReadyForDictation(compose)).toBe(false);
  });

  it('shows processing status inside Gmail even when the sidebar is not open', () => {
    const dialog = createCompose();
    const id = captureComposeId(dialog);
    showComposeVoiceStatus(id, 'processing', 'Organizing your email…');
    expect(dialog.querySelector('[data-flowdraft-status]')?.textContent).toContain('Organizing your email');
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

  it('routes one dictation and applies inline formatting after verifying the transcript is unchanged', async () => {
    const dialog = createCompose();
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'To sam@example.com. Subject: Update. Message: Quarterly update';
    body.textContent = transcript;
    // Gmail can replace its compose heading after the transcript is inserted.
    dialog.querySelector('[role="heading"]')!.textContent = 'Draft saved';
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
    const result = await applyVoiceDraft(composeId, transcript, response);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')!.textContent).toContain('sam@example.com');
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')!.value).toBe('Update');
    expect(body.textContent).toContain('Quarterly update');
    expect(body.textContent).not.toContain('Hey Wispr');
    expect(format).toHaveBeenCalledWith('bold');
  });

  it('accepts Gmail contact chips that display a name instead of the email address', async () => {
    const dialog = createCompose({ recipientDisplay: 'Soham Pawar (gmail.com)' });
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'Send mail to sam@example.com. The topic is update. Message: Hello.';
    body.textContent = transcript;
    const response = {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult;
    const result = await applyVoiceDraft(captureComposeId(dialog), transcript, response);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')?.textContent).toContain('Soham Pawar (gmail.com)');
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')?.getAttribute('data-hovercard-id')).toBe('sam@example.com');
    expect(body.textContent).toBe('Hello');
  });

  it('confirms the exact address from a nested Gmail recipient chip after delayed commit', async () => {
    const dialog = createCompose({ recipientDisplay: 'Soham Pawar (gmail.com)', recipientCommitDelayMs: 140 });
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'Send mail to sam@example.com. Topic update. Message Hello.';
    body.textContent = transcript;
    const result = await applyVoiceDraft(captureComposeId(dialog), transcript, {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult);
    expect(result.ok).toBe(true);
    expect(dialog.querySelector('[name="to"] .aUy [role="option"]')?.getAttribute('data-hovercard-id')).toBe('sam@example.com');
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')?.value).toBe('');
  });

  it('leaves subject and transcript untouched when recipient verification fails', async () => {
    const dialog = createCompose({ recipientDisplay: 'Different Contact', recipientCommitAs: 'other@example.com' });
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'Send mail to sam@example.com. Topic update. Message Hello.';
    body.textContent = transcript;
    const result = await applyVoiceDraft(captureComposeId(dialog), transcript, {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a recipient verification failure.');
    expect(result.reason).toContain('recipient');
    expect(result.reason).toContain('subject and dictated message unchanged');
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')?.getAttribute('data-hovercard-id')).toBe('other@example.com');
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')?.value).toBe('');
    expect(body.textContent).toBe(transcript);
  });

  it('confirms a nested chip without requiring a listbox wrapper or multiselect attribute', async () => {
    const dialog = createCompose({ recipientDisplay: 'Soham Pawar (gmail.com)' });
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'Send mail to sam@example.com. Topic update. Message Hello.';
    body.textContent = transcript;
    const result = await applyVoiceDraft(captureComposeId(dialog), transcript, {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')?.value).toBe('Update');
    expect(body.textContent).toBe('Hello');
  });

  it('reports which fields Gmail failed to confirm and restores all fields after a body write failure', async () => {
    const dialog = createCompose();
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'Send mail to sam@example.com. Topic update. Message Hello.';
    body.textContent = transcript;
    body.replaceChildren = () => undefined;
    const result = await applyVoiceDraft(captureComposeId(dialog), transcript, {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a message verification failure.');
    expect(result.reason).toContain('message');
    expect(result.reason).toContain('restored your dictated message');
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')?.getAttribute('data-hovercard-id')).toBe('sam@example.com');
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')?.value).toBe('');
    expect(body.textContent).toBe(transcript);
  });

  it('restores recipient and message when Gmail rejects the subject update', async () => {
    const dialog = createCompose();
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const subject = dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')!;
    const transcript = 'Send mail to sam@example.com. Topic update. Message Hello.';
    body.textContent = transcript;
    subject.addEventListener('input', () => {
      if (subject.value === 'Update') subject.value = '';
    });
    const result = await applyVoiceDraft(captureComposeId(dialog), transcript, {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a subject verification failure.');
    expect(result.reason).toContain('subject');
    expect(result.reason).toContain('restored your dictated message');
    expect(dialog.querySelector('[name="to"] [role="option"][data-hovercard-id]')?.getAttribute('data-hovercard-id')).toBe('sam@example.com');
    expect(subject.value).toBe('');
    expect(body.textContent).toBe(transcript);
  });

  it('leaves Gmail untouched if the user changed the pasted text during AI processing', async () => {
    const dialog = createCompose();
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    body.textContent = 'Edited while processing';
    const response = {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult;
    const before = dialog.innerHTML;
    dialog.dataset.flowdraftCaptureReady = 'true';
    const result = await applyVoiceDraft(captureComposeId(dialog), 'Original transcript', response);
    expect(result.ok).toBe(false);
    expect(dialog.innerHTML).toBe(before);
  });

  it('leaves the transcript and subject untouched if Gmail removes the recipient control', async () => {
    const dialog = createCompose();
    dialog.dataset.flowdraftCaptureReady = 'true';
    const body = dialog.querySelector<HTMLElement>('[aria-label="Message Body"]')!;
    const transcript = 'Send mail to sam@example.com. The topic is update. Message: Hello.';
    body.textContent = transcript;
    const composeId = captureComposeId(dialog);
    const response = {
      recipient: 'sam@example.com', subject: 'Update', body: 'Hello', formatting: [], clarification: null, requestsRemaining: 24,
    } satisfies VoiceParseResult;
    const input = dialog.querySelector<HTMLInputElement>('[aria-label="To recipients"]')!;
    input.replaceWith(Object.assign(document.createElement('input'), { name: 'different-recipient-field' }));
    const result = await applyVoiceDraft(composeId, transcript, response);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected the unavailable recipient control to be reported.');
    expect(result.reason).toContain('did not accept the recipient');
    expect(body.textContent).toBe(transcript);
    expect(dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]')!.value).toBe('');
    expect(dialog.querySelector('[name="to"] [role="option"]')).toBeNull();
  });
});
