import { api, ApiRequestError } from '@/lib/api';
import { getInstallationId } from '@/lib/identity';
import type { ApplyVoiceResultMessage, CapturedDictationMessage, VoiceStatusMessage } from '@/lib/messages';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isCapturedDictation(message) || !sender.tab?.id) return;
    void processDictation(sender.tab.id, message).then(sendResponse);
    return true;
  });
});

async function processDictation(tabId: number, message: CapturedDictationMessage): Promise<{ accepted: boolean }> {
  await sendStatus(tabId, { type: 'VOICE_STATUS', composeId: message.composeId, status: 'processing', text: 'Sorting your dictated email…' });
  try {
    const installationId = await getInstallationId();
    const result = await api.parseVoice(installationId, message.transcript);
    await chrome.storage.local.set({ requestsRemaining: result.requestsRemaining });
    if (!result.recipient?.trim() || !result.subject?.trim() || !result.body?.trim()) {
      await sendStatus(tabId, { type: 'VOICE_STATUS', composeId: message.composeId, status: 'clarification', text: result.clarification ?? 'Please say the recipient, subject, and message.', requestsRemaining: result.requestsRemaining });
      return { accepted: true };
    }
    const applyMessage: ApplyVoiceResultMessage = { type: 'APPLY_VOICE_RESULT', composeId: message.composeId, transcript: message.transcript, result };
    const applied = await chrome.tabs.sendMessage(tabId, applyMessage) as { ok?: boolean; reason?: string; message?: string };
    if (!applied?.ok) {
      await sendStatus(tabId, { type: 'VOICE_STATUS', composeId: message.composeId, status: 'clarification', text: applied?.reason ?? 'I could not safely update that draft. The dictated text is still there.', requestsRemaining: result.requestsRemaining });
    } else {
      const text = [applied.message ?? 'Draft filled. Review it in Gmail before sending.', result.clarification].filter(Boolean).join(' ');
      const needsAttention = Boolean(result.clarification || applied.message?.includes('Some formatting was skipped'));
      await sendStatus(tabId, { type: 'VOICE_STATUS', composeId: message.composeId, status: needsAttention ? 'clarification' : 'success', text, requestsRemaining: result.requestsRemaining });
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Could not process that dictation. The text remains in Gmail.';
    let requestsRemaining = error instanceof ApiRequestError ? error.requestsRemaining : undefined;
    if (typeof requestsRemaining === 'number') await chrome.storage.local.set({ requestsRemaining });
    if (requestsRemaining === undefined) {
      try {
        requestsRemaining = (await api.getUsage(await getInstallationId())).requestsRemaining;
        await chrome.storage.local.set({ requestsRemaining });
      } catch { /* Keep the last confirmed local quota value. */ }
    }
    await sendStatus(tabId, { type: 'VOICE_STATUS', composeId: message.composeId, status: 'error', text, ...(requestsRemaining === undefined ? {} : { requestsRemaining }) });
  }
  return { accepted: true };
}

async function sendStatus(tabId: number, message: VoiceStatusMessage): Promise<void> {
  try { await chrome.runtime.sendMessage(message); } catch { /* The sidebar may be closed. */ }
  try { await chrome.tabs.sendMessage(tabId, message); } catch { /* Gmail may have closed the compose or tab. */ }
}

function isCapturedDictation(value: unknown): value is CapturedDictationMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'DICTATION_CAPTURED'
    && 'composeId' in value && typeof value.composeId === 'string'
    && 'transcript' in value && typeof value.transcript === 'string';
}
