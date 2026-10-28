import { applyGmailFormatting, applyVoiceDraft, captureComposeId, composeBodyText, isFlowDraftDictation, isNewComposeReadyForDictation, listComposeWindows, newBlankComposeElements, retryFocusNewCompose, showComposeVoiceStatus, showFocusFallback, fillComposeWindow } from '@/lib/gmail-dom';
import type { ApplyFormatMessage, ApplyVoiceResultMessage, CapturedDictationMessage, FillDraftMessage, ListComposeMessage, VoiceStatusMessage } from '@/lib/messages';

const DICTATION_QUIET_MS = 1100;

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  runAt: 'document_idle',
  main() {
    const observedBodies = new WeakSet<HTMLElement>();
    const cancelFocusRetries = new WeakMap<HTMLElement, () => void>();
    const captureTimers = new WeakMap<HTMLElement, number>();
    const observeComposes = () => {
      for (const compose of newBlankComposeElements()) {
        const body = compose.querySelector<HTMLElement>('[aria-label="Message Body"][contenteditable="true"], [contenteditable="true"][g_editable="true"]');
        if (!body) continue;
        if (!observedBodies.has(body)) {
          observedBodies.add(body);
          captureComposeId(compose);
          compose.dataset.flowdraftCaptureReady = 'true';
          const scheduleCapture = () => {
            cancelFocusRetries.get(compose)?.();
            if (compose.dataset.flowdraftCaptureReady !== 'true' || compose.dataset.flowdraftProcessing === 'true') return;
            const previous = captureTimers.get(body);
            if (previous !== undefined) window.clearTimeout(previous);
            const timer = window.setTimeout(() => {
              captureTimers.delete(body);
              if (compose.dataset.flowdraftProcessing === 'true') return;
              if (!isNewComposeReadyForDictation(compose)) return;
              const transcript = composeBodyText(body);
              if (!transcript || !isFlowDraftDictation(transcript)) return;
              compose.dataset.flowdraftProcessing = 'true';
              showComposeVoiceStatus(captureComposeId(compose), 'processing', 'Organizing your email…');
              void chrome.runtime.sendMessage({ type: 'DICTATION_CAPTURED', composeId: captureComposeId(compose), transcript } satisfies CapturedDictationMessage)
                .catch(() => {
                  compose.dataset.flowdraftProcessing = 'false';
                  showComposeVoiceStatus(captureComposeId(compose), 'error', 'Could not reach FlowDraft. Your dictated text is still here.');
                });
            }, DICTATION_QUIET_MS);
            captureTimers.set(body, timer);
          };
          body.addEventListener('paste', scheduleCapture, true);
          body.addEventListener('input', scheduleCapture, true);
        }
        if (!compose.dataset.flowdraftFocusState) {
          cancelFocusRetries.set(compose, retryFocusNewCompose(compose, showFocusFallback));
        }
      }
    };
    observeComposes();
    const observer = new MutationObserver(observeComposes);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (isListCompose(message)) {
        sendResponse({ windows: listComposeWindows() });
        return;
      }
      if (isFillDraft(message)) {
        sendResponse(fillComposeWindow(message.composeIndex, message.draft));
        return;
      }
      if (isApplyFormat(message)) {
        sendResponse(applyGmailFormatting(message.composeIndex, message.format, message.occurrenceIndex));
        return;
      }
      if (isApplyVoiceResult(message)) {
        sendResponse(applyVoiceDraft(message.composeId, message.transcript, message.result));
        return true;
      }
      if (isVoiceStatus(message) && message.composeId) {
        showComposeVoiceStatus(message.composeId, message.status, message.text);
        return;
      }
      return true;
    });
  },
});

function isListCompose(value: unknown): value is ListComposeMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'LIST_COMPOSES';
}

function isApplyVoiceResult(value: unknown): value is ApplyVoiceResultMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'APPLY_VOICE_RESULT';
}
function isFillDraft(value: unknown): value is FillDraftMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'FILL_DRAFT';
}
function isApplyFormat(value: unknown): value is ApplyFormatMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'APPLY_FORMAT';
}
function isVoiceStatus(value: unknown): value is VoiceStatusMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'VOICE_STATUS'
    && 'status' in value && (value.status === 'processing' || value.status === 'success' || value.status === 'clarification' || value.status === 'error')
    && 'text' in value && typeof value.text === 'string';
}
