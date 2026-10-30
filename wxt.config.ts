import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'MakTabs',
    description: 'Stash open tabs into native browser bookmarks with built-in cloud sync.',
    permissions: [
      'bookmarks',
      'tabs',
      'storage',
      ...(browser === 'firefox' ? [] : ['favicon']),
    ],
    host_permissions: [
      'https://raw.githubusercontent.com/*',
    ],
    action: {
      default_title: 'MakTabs',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'maktabs@rain64x.github.io',
              strict_min_version: '109.0',
            },
          },
        }
      : {}),
  }),
});
