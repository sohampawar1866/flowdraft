import { applyGmailFormatting, applyVoiceDraft, captureComposeId, isFlowDraftDictation, listComposeWindows, newBlankComposeElements, prepareNewComposeForDictation, fillComposeWindow } from '@/lib/gmail-dom';
import type { ApplyFormatMessage, ApplyVoiceResultMessage, CapturedDictationMessage, FillDraftMessage, ListComposeMessage } from '@/lib/messages';

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  runAt: 'document_idle',
  main() {
    const observedBodies = new WeakSet<HTMLElement>();
    const observeComposes = () => {
      prepareNewComposeForDictation();
      for (const compose of newBlankComposeElements()) {
        const body = compose.querySelector<HTMLElement>('[aria-label="Message Body"][contenteditable="true"], [contenteditable="true"][g_editable="true"]');
        if (!body || observedBodies.has(body)) continue;
        observedBodies.add(body);
        captureComposeId(compose);
        compose.dataset.flowdraftCaptureReady = 'true';
        body.addEventListener('paste', (event) => {
          if (compose.dataset.flowdraftCaptureReady !== 'true' || compose.dataset.flowdraftProcessing === 'true') return;
          const transcript = event.clipboardData?.getData('text/plain')?.trim();
          if (!transcript || !isFlowDraftDictation(transcript)) return;
          compose.dataset.flowdraftProcessing = 'true';
          void chrome.runtime.sendMessage({ type: 'DICTATION_CAPTURED', composeId: captureComposeId(compose), transcript } satisfies CapturedDictationMessage)
            .catch(() => { compose.dataset.flowdraftProcessing = 'false'; });
        }, true);
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
