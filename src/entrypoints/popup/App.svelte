<script lang="ts">
  import { onMount } from 'svelte';
  import {
    stashCurrentTab,
    stashAllTabs,
    getStashableTabsInfo,
  } from '@/lib/bookmarks';

  let isProcessing = $state(false);
  let status = $state<{
    type: 'idle' | 'success' | 'warning' | 'error';
    message: string;
  }>({
    type: 'idle',
    message: '',
  });

  let totalValidTabs = $state<number | null>(null);
  let isCurrentValid = $state(true);

  async function refreshTabInfo() {
    try {
      const info = await getStashableTabsInfo();
      totalValidTabs = info.totalValid;
      isCurrentValid = info.isCurrentValid;
    } catch {
      // Ignore background query error
    }
  }

  onMount(() => {
    refreshTabInfo();
  });

  async function handleStashCurrent() {
    if (isProcessing) return;
    isProcessing = true;
    status = { type: 'idle', message: '' };

    try {
      const res = await stashCurrentTab();
      status = {
        type: res.success ? 'success' : 'warning',
        message: res.message,
      };
      await refreshTabInfo();
    } catch (err) {
      status = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to stash tab',
      };
    } finally {
      isProcessing = false;
    }
  }

  async function handleStashAll() {
    if (isProcessing) return;
    isProcessing = true;
    status = { type: 'idle', message: '' };

    try {
      const res = await stashAllTabs();
      status = {
        type: res.success ? 'success' : 'warning',
        message: res.message,
      };
      await refreshTabInfo();
    } catch (err) {
      status = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to stash tabs',
      };
    } finally {
      isProcessing = false;
    }
  }
</script>

<main class="container">
  <header>
    <div class="logo-row">
      <img src="/logo.svg" alt="MakTabs logo" class="logo-img" width="28" height="28" />
      <h1>MakTabs</h1>
    </div>
    <p class="subtitle">Stash tabs into native bookmarks</p>
  </header>

  <div class="actions">
    <button
      type="button"
      class="btn btn-primary"
      onclick={handleStashCurrent}
      disabled={isProcessing}
      title={isCurrentValid ? 'Stash active tab to makTabs' : 'Current tab cannot be bookmarked'}
    >
      <span class="btn-icon">📌</span>
      <span class="btn-text">This tab</span>
    </button>

    <button
      type="button"
      class="btn btn-secondary"
      onclick={handleStashAll}
      disabled={isProcessing || (totalValidTabs !== null && totalValidTabs === 0)}
      title="Stash all open tabs in this window"
    >
      <span class="btn-icon">📑</span>
      <span class="btn-text">
        All tabs {totalValidTabs !== null ? `(${totalValidTabs})` : ''}
      </span>
    </button>
  </div>

  {#if status.message}
    <div
      class="status-banner status-{status.type}"
      role="status"
      aria-live="polite"
    >
      {#if status.type === 'success'}
        <span class="status-icon">✓</span>
      {:else if status.type === 'warning'}
        <span class="status-icon">⚠</span>
      {:else if status.type === 'error'}
        <span class="status-icon">✕</span>
      {/if}
      <span class="status-text">{status.message}</span>
    </div>
  {/if}

  <footer>
    <p class="target-folder">Target folder: <strong>makTabs</strong></p>
  </footer>
</main>

<style>
  .container {
    width: 320px;
    padding: 1.25rem 1rem 1rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  header {
    text-align: center;
  }

  .logo-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .logo-img {
    border-radius: 6px;
    display: block;
  }

  h1 {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 0.8rem;
    opacity: 0.65;
    margin: 0.25rem 0 0 0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
  }

  .btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.65rem 0.75rem;
    font-size: 0.9rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    user-select: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .btn-primary {
    background-color: #2563eb;
    color: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #1d4ed8;
  }

  .btn-primary:active:not(:disabled) {
    background-color: #1e40af;
  }

  .btn-secondary {
    background-color: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: #e2e8f0;
  }

  .btn-secondary:active:not(:disabled) {
    background-color: #cbd5e1;
  }

  @media (prefers-color-scheme: dark) {
    .btn-secondary {
      background-color: #27272a;
      color: #f4f4f5;
      border-color: #3f3f46;
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: #3f3f46;
    }

    .btn-secondary:active:not(:disabled) {
      background-color: #52525b;
    }
  }

  .btn-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    line-height: 1.35;
    animation: fadeIn 0.15s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .status-icon {
    font-weight: bold;
    flex-shrink: 0;
  }

  .status-success {
    background-color: rgba(34, 197, 94, 0.12);
    color: #16a34a;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .status-warning {
    background-color: rgba(245, 158, 11, 0.12);
    color: #d97706;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .status-error {
    background-color: rgba(239, 68, 68, 0.12);
    color: #dc2626;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  @media (prefers-color-scheme: dark) {
    .status-success {
      background-color: rgba(34, 197, 94, 0.18);
      color: #4ade80;
      border-color: rgba(34, 197, 94, 0.3);
    }

    .status-warning {
      background-color: rgba(245, 158, 11, 0.18);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.3);
    }

    .status-error {
      background-color: rgba(239, 68, 68, 0.18);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.3);
    }
  }

  footer {
    border-top: 1px solid rgba(128, 128, 128, 0.15);
    padding-top: 0.5rem;
    text-align: center;
  }

  .target-folder {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.6;
  }
</style>
