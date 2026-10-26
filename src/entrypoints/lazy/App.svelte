<script lang="ts">
  import { onMount } from 'svelte';
  import {
    isStashableUrl,
    extractDomain,
    getDomainInitial,
    getDomainColor,
  } from '@/lib/bookmarks';

  let targetUrl = $state('');
  let pageTitle = $state('Paused Tab');
  let domain = $state('');
  let initial = $state('?');
  let badgeColor = $state('#2563eb');
  let isValid = $state(true);
  let isWaking = $state(false);

  function wakeTab() {
    if (isWaking || !isValid || !targetUrl) return;
    isWaking = true;
    window.location.replace(targetUrl);
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const rawUrl = params.get('url') || '';
    const rawTitle = params.get('title') || '';

    if (!rawUrl || !isStashableUrl(rawUrl)) {
      isValid = false;
      document.title = 'Invalid URL';
      return;
    }

    targetUrl = rawUrl;
    pageTitle = rawTitle || rawUrl;
    domain = extractDomain(rawUrl);
    initial = getDomainInitial(domain);
    badgeColor = getDomainColor(domain);

    // Set page title so browser tab displays the actual website title
    document.title = pageTitle;

    // If tab is already visible and focused when loaded, wake immediately
    if (!document.hidden && document.hasFocus()) {
      wakeTab();
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        wakeTab();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', wakeTab);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', wakeTab);
    };
  });
</script>

<main class="lazy-container">
  <div class="lazy-card">
    <!-- Header with MakTabs Memory Saver Pill -->
    <div class="saver-badge">
      <img src="/logo.svg" alt="MakTabs" width="16" height="16" class="logo-icon" />
      <span>MakTabs • Memory Saver Mode</span>
    </div>

    <!-- Domain Monogram Badge -->
    <div class="monogram-badge" style="background-color: {badgeColor};">
      {initial}
    </div>

    <!-- Website Title & Domain -->
    <h1 class="page-title">{pageTitle}</h1>
    <p class="page-domain">{domain || targetUrl}</p>

    <!-- Info Prompt -->
    {#if !isValid}
      <div class="status-box error">
        ⚠️ Cannot load page: invalid or restricted URL scheme.
      </div>
    {:else if isWaking}
      <div class="status-box waking">
        ⚡ Loading webpage...
      </div>
    {:else}
      <div class="status-box paused">
        💤 Tab is paused in memory saver mode to keep your browser fast.
        <br />
        <span class="sub-hint">Switch to this tab or click below to load.</span>
      </div>

      <button
        type="button"
        class="load-btn"
        onclick={wakeTab}
      >
        Load Webpage Now ↗
      </button>
    {/if}
  </div>
</main>

<style>
  .lazy-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .lazy-card {
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    padding: 2.25rem 2.5rem;
    max-width: 480px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
  }

  .saver-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.76rem;
    font-weight: 600;
    background-color: rgba(37, 99, 235, 0.12);
    color: var(--primary);
    border: 1px solid rgba(37, 99, 235, 0.25);
    margin-bottom: 1.5rem;
  }

  .logo-icon {
    display: block;
    border-radius: 3px;
  }

  .monogram-badge {
    width: 58px;
    height: 58px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.45rem;
    font-weight: 700;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
    margin-bottom: 1.15rem;
  }

  .page-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0 0 0.35rem 0;
    line-height: 1.35;
    word-break: break-word;
  }

  .page-domain {
    font-size: 0.88rem;
    color: var(--text-muted);
    margin: 0 0 1.5rem 0;
    word-break: break-all;
  }

  .status-box {
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 0.84rem;
    line-height: 1.45;
    margin-bottom: 1.25rem;
    box-sizing: border-box;
  }

  .status-box.paused {
    background-color: rgba(128, 128, 128, 0.08);
    border: 1px solid var(--border-color);
    color: var(--text-main);
  }

  .status-box.waking {
    background-color: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #16a34a;
  }

  .status-box.error {
    background-color: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .sub-hint {
    font-size: 0.76rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
    display: inline-block;
  }

  .load-btn {
    background-color: var(--primary);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1.4rem;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .load-btn:hover {
    background-color: var(--primary-hover);
    transform: translateY(-1px);
  }
</style>
