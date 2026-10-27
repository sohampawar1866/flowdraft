export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'focus-format-command') return;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.windowId) return;
    await chrome.sidePanel.open({ windowId: tab.windowId });
    await chrome.storage.local.set({ focusFormatCommandAt: Date.now() });
  });
});
