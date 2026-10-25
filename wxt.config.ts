import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'MakTabs',
    description: 'Stash open tabs into native browser bookmarks with built-in cloud sync.',
    permissions: ['bookmarks', 'tabs', 'storage'],
  },
});
