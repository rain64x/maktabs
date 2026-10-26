<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    stashCurrentTab,
    stashAllTabs,
    getStashableTabsInfo,
  } from '@/lib/bookmarks';

  let target = $state<'window' | 'this'>('window');
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

  let canExecute = $derived(
    target === 'window'
      ? totalValidTabs === null || totalValidTabs > 0
      : isCurrentValid
  );

  async function refreshTabInfo() {
    try {
      const info = await getStashableTabsInfo();
      totalValidTabs = info.totalValid;
      isCurrentValid = info.isCurrentValid;
    } catch {
      // Ignore background query error
    }
  }

  onMount(async () => {
    await refreshTabInfo();
    try {
      const stored = await browser.storage.local.get('maktabs_target');
      if (stored.maktabs_target === 'window' || stored.maktabs_target === 'this') {
        target = stored.maktabs_target;
      }
    } catch {
      // Ignore storage error
    }
  });

  function selectTarget(newTarget: 'window' | 'this') {
    target = newTarget;
    browser.storage.local.set({ maktabs_target: newTarget }).catch(() => {});
  }

  async function handleExecute(closeAfter: boolean) {
    if (isProcessing || !canExecute) return;
    isProcessing = true;
    status = { type: 'idle', message: '' };

    try {
      const res =
        target === 'window'
          ? await stashAllTabs(closeAfter)
          : await stashCurrentTab(closeAfter);

      status = {
        type: res.success ? 'success' : 'warning',
        message: res.message,
      };
      await refreshTabInfo();
    } catch (err) {
      status = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Action failed',
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

  <div class="panel">
    <!-- Row 1: Target Segmented Pill -->
    <div class="control-row">
      <span class="label">Target:</span>
      <div class="segmented-pill" role="radiogroup" aria-label="Target tabs selection">
        <button
          type="button"
          role="radio"
          aria-checked={target === 'window'}
          class="pill-segment {target === 'window' ? 'active' : ''}"
          onclick={() => selectTarget('window')}
          title="Target all open tabs in this window"
        >
          This window {totalValidTabs !== null ? `(${totalValidTabs})` : ''}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={target === 'this'}
          class="pill-segment {target === 'this' ? 'active' : ''}"
          onclick={() => selectTarget('this')}
          title={isCurrentValid ? 'Target current active tab' : 'Current tab cannot be bookmarked'}
        >
          This tab
        </button>
      </div>
    </div>

    <!-- Row 2: Action Buttons -->
    <div class="control-row">
      <span class="label">Action:</span>
      <div class="btn-group">
        <button
          type="button"
          class="btn-sm btn-action btn-close"
          onclick={() => handleExecute(true)}
          disabled={isProcessing || !canExecute}
          title="Save target tab(s) to makTabs bookmarks and close them"
        >
          Save and Close
        </button>
        <button
          type="button"
          class="btn-sm btn-action btn-save"
          onclick={() => handleExecute(false)}
          disabled={isProcessing || !canExecute}
          title="Save target tab(s) to makTabs bookmarks without closing"
        >
          Save only
        </button>
      </div>
    </div>
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
    padding: 1.1rem 1rem 0.9rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
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
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 0.78rem;
    opacity: 0.65;
    margin: 0.2rem 0 0 0;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(128, 128, 128, 0.05);
    border: 1px solid rgba(128, 128, 128, 0.12);
    border-radius: 8px;
    padding: 0.75rem 0.7rem;
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.82rem;
    font-weight: 600;
    opacity: 0.8;
    min-width: 48px;
    user-select: none;
  }

  /* Segmented Pill Toggle */
  .segmented-pill {
    display: inline-flex;
    background-color: #e2e8f0;
    padding: 2.5px;
    border-radius: 9999px;
    position: relative;
    user-select: none;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
    flex: 1;
    justify-content: flex-end;
    max-width: 200px;
  }

  .pill-segment {
    flex: 1;
    border: none;
    background: transparent;
    padding: 0.32rem 0.6rem;
    font-size: 0.76rem;
    font-weight: 500;
    color: #64748b;
    border-radius: 9999px;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    text-align: center;
    outline: none;
  }

  .pill-segment:hover:not(.active) {
    color: #1e293b;
  }

  .pill-segment.active {
    background-color: #ffffff;
    color: #0f172a;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  @media (prefers-color-scheme: dark) {
    .segmented-pill {
      background-color: #27272a;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .pill-segment {
      color: #a1a1aa;
    }

    .pill-segment:hover:not(.active) {
      color: #f4f4f5;
    }

    .pill-segment.active {
      background-color: #3b82f6;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
  }

  .btn-group {
    display: flex;
    gap: 0.4rem;
    flex: 1;
    justify-content: flex-end;
  }

  /* Compact Action Buttons */
  .btn-sm {
    padding: 0.38rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    user-select: none;
    white-space: nowrap;
    text-align: center;
    min-width: 82px;
  }

  .btn-sm:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }

  .btn-action.btn-close {
    background-color: #2563eb;
    color: #ffffff;
    border-color: #1d4ed8;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .btn-action.btn-close:hover:not(:disabled) {
    background-color: #1d4ed8;
  }

  .btn-action.btn-close:active:not(:disabled) {
    background-color: #1e40af;
  }

  .btn-action.btn-save {
    background-color: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .btn-action.btn-save:hover:not(:disabled) {
    background-color: #e2e8f0;
  }

  .btn-action.btn-save:active:not(:disabled) {
    background-color: #cbd5e1;
  }

  @media (prefers-color-scheme: dark) {
    .btn-action.btn-save {
      background-color: #27272a;
      color: #f4f4f5;
      border-color: #3f3f46;
    }

    .btn-action.btn-save:hover:not(:disabled) {
      background-color: #3f3f46;
    }

    .btn-action.btn-save:active:not(:disabled) {
      background-color: #52525b;
    }
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.65rem;
    border-radius: 6px;
    font-size: 0.78rem;
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
    padding-top: 0.45rem;
    text-align: center;
  }

  .target-folder {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.6;
  }
</style>
