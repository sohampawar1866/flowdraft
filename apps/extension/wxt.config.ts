import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

const extensionPackage = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const apiBaseUrl = process.env.WXT_API_BASE_URL || 'https://wispr-voice-email-api.onrender.com';
const apiOrigin = new URL(apiBaseUrl).origin;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Wispr Voice Email',
    description: 'Dictate a complete Gmail draft and polish it by voice with Wispr Flow.',
    version: extensionPackage.version,
    permissions: ['storage', 'sidePanel', 'commands'],
    host_permissions: ['https://mail.google.com/*', `${apiOrigin}/*`],
    commands: {
      'focus-format-command': {
        suggested_key: { default: 'Alt+Shift+M', mac: 'Alt+Shift+M' },
        description: 'Open the Wispr formatting command box',
      },
    },
    side_panel: { default_path: 'sidepanel.html' },
    icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  },
  vite: () => ({
    define: {
      __WISPR_API_BASE_URL__: JSON.stringify(apiBaseUrl.replace(/\/$/, '')),
    },
  }),
});
