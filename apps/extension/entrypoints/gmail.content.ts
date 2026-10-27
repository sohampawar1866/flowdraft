import { applyGmailFormatting, listComposeWindows, fillComposeWindow } from '@/lib/gmail-dom';
import type { ApplyFormatMessage, FillDraftMessage, ListComposeMessage } from '@/lib/messages';

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  runAt: 'document_idle',
  main() {
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
      }
      return true;
    });
  },
});

function isListCompose(value: unknown): value is ListComposeMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'LIST_COMPOSES';
}
function isFillDraft(value: unknown): value is FillDraftMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'FILL_DRAFT';
}
function isApplyFormat(value: unknown): value is ApplyFormatMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'APPLY_FORMAT';
}
