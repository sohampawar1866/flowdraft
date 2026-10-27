const INSTALLATION_KEY = 'installationId';

export async function getInstallationId(): Promise<string> {
  const stored = await chrome.storage.local.get(INSTALLATION_KEY);
  const existing = stored[INSTALLATION_KEY];
  if (typeof existing === 'string' && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const installationId = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALLATION_KEY]: installationId });
  return installationId;
}
