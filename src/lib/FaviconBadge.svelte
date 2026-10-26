<script lang="ts">
  import { getFaviconUrl } from '@/lib/bookmarks';

  let {
    url = '',
    title = '',
    domain = '',
    initial = '?',
    badgeColor = '#64748b',
    size = 'normal',
  }: {
    url?: string;
    title?: string;
    domain?: string;
    initial?: string;
    badgeColor?: string;
    size?: 'tree' | 'popup' | 'normal' | 'large';
  } = $props();

  let hasError = $state(false);
  let faviconUrl = $derived(url ? getFaviconUrl(url, size === 'large' ? 64 : 32) : '');

  $effect(() => {
    // Reset error when URL changes
    url;
    hasError = false;
  });
</script>

{#if faviconUrl && !hasError}
  <div class="favicon-badge size-{size}" title={domain || title}>
    <img
      src={faviconUrl}
      alt=""
      class="favicon-img"
      loading="lazy"
      onerror={() => {
        hasError = true;
      }}
    />
  </div>
{:else}
  <div
    class="monogram-badge size-{size}"
    style="background-color: {badgeColor};"
    title={domain || title}
  >
    {initial}
  </div>
{/if}

<style>
  .favicon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    flex-shrink: 0;
    overflow: hidden;
  }

  .monogram-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #ffffff;
    flex-shrink: 0;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
  }

  /* Tree node sizing (26px) */
  .size-tree {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    font-size: 0.7rem;
  }
  .size-tree .favicon-img {
    width: 16px;
    height: 16px;
  }

  /* Popup list item sizing (24px) */
  .size-popup {
    width: 24px;
    height: 24px;
    border-radius: 5px;
    font-size: 0.68rem;
  }
  .size-popup .favicon-img {
    width: 15px;
    height: 15px;
  }

  /* Manager list & grid sizing (32px) */
  .size-normal {
    width: 32px;
    height: 32px;
    border-radius: 7px;
    font-size: 0.78rem;
  }
  .size-normal .favicon-img {
    width: 18px;
    height: 18px;
  }

  /* Lazy/Snooze hero tab sizing (64px) */
  .size-large {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    font-size: 1.5rem;
  }
  .size-large .favicon-img {
    width: 36px;
    height: 36px;
  }

  .favicon-img {
    object-fit: contain;
    display: block;
  }
</style>
