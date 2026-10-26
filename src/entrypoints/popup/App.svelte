<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    stashCurrentTab,
    stashAllTabs,
    getStashableTabsInfo,
    getOrCreateMakTabsFolder,
    getFolderContents,
    moveBookmarkItem,
    deleteBookmarkNode,
    openBookmarkUrl,
    restoreAndOptionallyRemoveFolder,
    getMemorySaverPreference,
    extractDomain,
    getDomainInitial,
    getDomainColor,
    type BookmarkItem,
  } from '@/lib/bookmarks';

  // Mode View: Stash or Bookmarks
  let activeTab = $state<'stash' | 'bookmarks'>('stash');
  let memorySaver = $state(true);

  // Stashing State
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
  let isCurrentPinned = $state(false);

  let canExecute = $derived(
    target === 'window'
      ? totalValidTabs === null || totalValidTabs > 0
      : isCurrentValid
  );

  // In-Popup Bookmarks State
  let rootMakTabsId = $state<string>('');
  let currentFolderId = $state<string>('');
  let folderHistory = $state<{ id: string; title: string }[]>([]);
  let bookmarkItems = $state<BookmarkItem[]>([]);
  let searchQuery = $state('');
  let isBookmarksLoading = $state(false);

  // Drag and Drop State for Popup
  let draggedItem = $state<BookmarkItem | null>(null);
  let dragOverItemId = $state<string | null>(null);
  let dropPosition = $state<'before' | 'after' | 'folder' | null>(null);

  let filteredBookmarks = $derived.by(() => {
    if (!searchQuery.trim()) return bookmarkItems;
    const q = searchQuery.toLowerCase().trim();
    return bookmarkItems.filter(
      (b) => b.title.toLowerCase().includes(q) || (b.url && b.url.toLowerCase().includes(q))
    );
  });

  async function refreshTabInfo() {
    try {
      const info = await getStashableTabsInfo();
      totalValidTabs = info.totalValid;
      isCurrentValid = info.isCurrentValid;
      isCurrentPinned = info.isCurrentPinned;
    } catch {
      // Ignore background query error
    }
  }

  async function loadPopupBookmarks(folderId?: string) {
    isBookmarksLoading = true;
    try {
      if (!rootMakTabsId) {
        rootMakTabsId = await getOrCreateMakTabsFolder();
      }
      const targetId = folderId || currentFolderId || rootMakTabsId;
      currentFolderId = targetId;
      bookmarkItems = await getFolderContents(targetId);
    } catch (err) {
      console.error('Failed to load bookmarks in popup:', err);
    } finally {
      isBookmarksLoading = false;
    }
  }

  onMount(async () => {
    await refreshTabInfo();
    memorySaver = await getMemorySaverPreference();
    try {
      const stored = await browser.storage.local.get(['maktabs_target', 'maktabs_popup_tab']);
      if (stored.maktabs_target === 'window' || stored.maktabs_target === 'this') {
        target = stored.maktabs_target;
      }
      if (stored.maktabs_popup_tab === 'stash' || stored.maktabs_popup_tab === 'bookmarks') {
        activeTab = stored.maktabs_popup_tab;
        if (activeTab === 'bookmarks') {
          await loadPopupBookmarks();
        }
      }
    } catch {
      // Ignore storage error
    }
  });

  function selectTab(newTab: 'stash' | 'bookmarks') {
    activeTab = newTab;
    browser.storage.local.set({ maktabs_popup_tab: newTab }).catch(() => {});
    if (newTab === 'bookmarks' && bookmarkItems.length === 0) {
      loadPopupBookmarks();
    }
  }

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
      if (currentFolderId) {
        await loadPopupBookmarks(currentFolderId);
      }
    } catch (err) {
      status = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Action failed',
      };
    } finally {
      isProcessing = false;
    }
  }

  function openFullManager() {
    browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
  }

  // Popup Bookmark Navigation
  async function navigateIntoFolder(item: BookmarkItem) {
    folderHistory.push({ id: currentFolderId, title: item.title });
    folderHistory = [...folderHistory];
    await loadPopupBookmarks(item.id);
  }

  async function navigateBack() {
    if (folderHistory.length === 0) return;
    const previous = folderHistory.pop();
    folderHistory = [...folderHistory];
    if (previous) {
      await loadPopupBookmarks(previous.id);
    }
  }

  async function handleOpenBookmark(item: BookmarkItem) {
    if (!item.url) {
      await navigateIntoFolder(item);
      return;
    }
    await openBookmarkUrl(item.url, true);
  }

  async function handleDeleteBookmark(item: BookmarkItem) {
    await deleteBookmarkNode(item.id, !item.url);
    await loadPopupBookmarks(currentFolderId);
  }

  async function handleRestoreSession(folderId: string, removeAfter: boolean) {
    await restoreAndOptionallyRemoveFolder(folderId, removeAfter, false, memorySaver);
    await loadPopupBookmarks(currentFolderId);
  }

  // Popup Drag and Drop Handlers
  function handleDragStart(e: DragEvent, item: BookmarkItem) {
    draggedItem = item;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    }
  }

  function handleDragEnd() {
    draggedItem = null;
    dragOverItemId = null;
    dropPosition = null;
  }

  function handleItemDragOver(e: DragEvent, targetItem: BookmarkItem) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) return;

    const targetEl = e.currentTarget as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;

    if (!targetItem.url) {
      if (offsetY < height * 0.25) {
        dropPosition = 'before';
      } else if (offsetY > height * 0.75) {
        dropPosition = 'after';
      } else {
        dropPosition = 'folder';
      }
    } else {
      dropPosition = offsetY < height * 0.5 ? 'before' : 'after';
    }

    dragOverItemId = targetItem.id;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleItemDragLeave(targetItem: BookmarkItem) {
    if (dragOverItemId === targetItem.id) {
      dragOverItemId = null;
      dropPosition = null;
    }
  }

  async function handleItemDrop(e: DragEvent, targetItem: BookmarkItem) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) {
      handleDragEnd();
      return;
    }

    const dragged = draggedItem;
    const pos = dropPosition;
    handleDragEnd();

    try {
      if (pos === 'folder' && !targetItem.url) {
        await moveBookmarkItem(dragged.id, { parentId: targetItem.id });
      } else if (pos === 'before' || pos === 'after') {
        const fromIdx = bookmarkItems.findIndex((i) => i.id === dragged.id);
        const toIdx = bookmarkItems.findIndex((i) => i.id === targetItem.id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const newIndex = pos === 'before'
            ? (fromIdx < toIdx ? toIdx - 1 : toIdx)
            : (fromIdx < toIdx ? toIdx : toIdx + 1);

          await moveBookmarkItem(dragged.id, {
            parentId: currentFolderId,
            index: Math.max(0, newIndex),
          });
        }
      }
      await loadPopupBookmarks(currentFolderId);
    } catch (err) {
      console.error('Failed to reorder in popup:', err);
    }
  }
</script>

<main class="container">
  <!-- Header with Brand and Full Manager Shortcut -->
  <header>
    <div class="header-top">
      <div class="logo-row">
        <img src="/logo.svg" alt="MakTabs logo" class="logo-img" width="24" height="24" />
        <h1 class="logo-title">MakTabs</h1>
      </div>

      <button
        type="button"
        class="btn-manager-link"
        onclick={openFullManager}
        title="Open full Bookmarks Manager in new tab"
      >
        <span>Manager</span>
        <span class="icon-external">↗</span>
      </button>
    </div>

    <!-- Navigation Tabs: Stash vs Bookmarks -->
    <div class="tab-switcher" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'stash'}
        class="tab-btn {activeTab === 'stash' ? 'active' : ''}"
        onclick={() => selectTab('stash')}
      >
        ⚡ Stash
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'bookmarks'}
        class="tab-btn {activeTab === 'bookmarks' ? 'active' : ''}"
        onclick={() => selectTab('bookmarks')}
      >
        📑 Bookmarks
      </button>
    </div>
  </header>

  <!-- View 1: Fast Stash -->
  {#if activeTab === 'stash'}
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
            title={isCurrentPinned
              ? 'Current tab is pinned and protected'
              : isCurrentValid
                ? 'Target current active tab'
                : 'Current tab cannot be bookmarked'}
          >
            This tab
          </button>
        </div>
      </div>

      {#if target === 'this' && isCurrentPinned}
        <div class="pinned-notice">
          <span>📌 Pinned tabs are protected from stashing.</span>
        </div>
      {/if}

      <!-- Row 2: Action Buttons -->
      <div class="control-row">
        <span class="label">Action:</span>
        <div class="btn-group">
          <button
            type="button"
            class="btn-sm btn-action btn-close"
            onclick={() => handleExecute(true)}
            disabled={isProcessing || !canExecute}
            title={target === 'this' && isCurrentPinned
              ? 'Pinned tabs are protected'
              : 'Save target tab(s) to makTabs bookmarks and close them'}
          >
            Save and Close
          </button>
          <button
            type="button"
            class="btn-sm btn-action btn-save"
            onclick={() => handleExecute(false)}
            disabled={isProcessing || !canExecute}
            title={target === 'this' && isCurrentPinned
              ? 'Pinned tabs are protected'
              : 'Save target tab(s) to makTabs bookmarks without closing'}
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

  <!-- View 2: In-Popup Bookmarks Manager -->
  {:else}
    <div class="bookmarks-panel">
      <!-- Search & Nav Header -->
      <div class="b-header">
        {#if folderHistory.length > 0}
          <button
            type="button"
            class="b-back-btn"
            onclick={navigateBack}
            title="Go to parent folder"
          >
            ← Back
          </button>
        {/if}

        <input
          type="search"
          class="b-search-input"
          placeholder="Filter bookmarks..."
          bind:value={searchQuery}
          aria-label="Filter bookmarks"
        />
      </div>

      <!-- Bookmarks List with Drag and Drop -->
      <div class="b-list">
        {#if isBookmarksLoading}
          <div class="b-empty">Loading bookmarks...</div>
        {:else if filteredBookmarks.length === 0}
          <div class="b-empty">
            {searchQuery ? 'No bookmarks match your filter.' : 'Folder is empty.'}
          </div>
        {:else}
          {#each filteredBookmarks as item (item.id)}
            {@const isFolder = !item.url}
            {@const domain = item.url ? extractDomain(item.url) : ''}
            {@const badgeColor = item.url ? getDomainColor(domain) : ''}
            {@const initial = item.url ? getDomainInitial(domain) : ''}
            {@const isDraggingThis = draggedItem?.id === item.id}
            {@const isDragOver = dragOverItemId === item.id}

            <div
              class="b-item {isDraggingThis ? 'dragging' : ''} {isDragOver && dropPosition === 'before' ? 'drop-before' : ''} {isDragOver && dropPosition === 'after' ? 'drop-after' : ''} {isDragOver && dropPosition === 'folder' ? 'drop-folder' : ''}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, item)}
              ondragend={handleDragEnd}
              ondragover={(e) => handleItemDragOver(e, item)}
              ondragleave={() => handleItemDragLeave(item)}
              ondrop={(e) => handleItemDrop(e, item)}
              role="listitem"
            >
              <span class="b-drag-handle" title="Drag to reorder">⋮⋮</span>

              {#if isFolder}
                <div
                  class="b-badge b-badge-folder"
                  onclick={() => navigateIntoFolder(item)}
                  onkeydown={(e) => e.key === 'Enter' && navigateIntoFolder(item)}
                  role="button"
                  tabindex="0"
                  title="Open folder"
                >
                  📁
                </div>
                <div
                  class="b-info"
                  onclick={() => navigateIntoFolder(item)}
                  onkeydown={(e) => e.key === 'Enter' && navigateIntoFolder(item)}
                  role="button"
                  tabindex="0"
                >
                  <span class="b-title">{item.title}</span>
                  <span class="b-meta">{item.childrenCount ?? 0} items</span>
                </div>
                <div class="b-actions">
                  <button
                    type="button"
                    class="b-action-btn"
                    onclick={() => handleRestoreSession(item.id, false)}
                    title="Restore tabs from session"
                  >
                    ⚡
                  </button>
                  <button
                    type="button"
                    class="b-action-btn b-delete"
                    onclick={() => handleDeleteBookmark(item)}
                    title="Delete folder"
                  >
                    🗑️
                  </button>
                </div>
              {:else}
                <div
                  class="b-badge"
                  style="background-color: {badgeColor};"
                  title={domain}
                >
                  {initial}
                </div>
                <div
                  class="b-info"
                  onclick={() => handleOpenBookmark(item)}
                  onkeydown={(e) => e.key === 'Enter' && handleOpenBookmark(item)}
                  role="button"
                  tabindex="0"
                  title={item.url}
                >
                  <span class="b-title">{item.title}</span>
                  <span class="b-meta">{domain || item.url}</span>
                </div>
                <div class="b-actions">
                  <button
                    type="button"
                    class="b-action-btn"
                    onclick={() => handleOpenBookmark(item)}
                    title="Open in new tab"
                  >
                    ↗
                  </button>
                  <button
                    type="button"
                    class="b-action-btn b-delete"
                    onclick={() => handleDeleteBookmark(item)}
                    title="Delete bookmark"
                  >
                    🗑️
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer with Full Manager Button -->
      <footer class="b-footer">
        <button
          type="button"
          class="btn-full-manager"
          onclick={openFullManager}
        >
          Open Full Bookmarks Manager ↗
        </button>
      </footer>
    </div>
  {/if}
</main>

<style>
  .container {
    width: 340px;
    padding: 0.85rem 0.9rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .logo-img {
    border-radius: 5px;
    display: block;
  }

  .logo-title {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }

  .btn-manager-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 9999px;
    border: 1px solid rgba(37, 99, 235, 0.3);
    background-color: rgba(37, 99, 235, 0.08);
    color: #2563eb;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-manager-link:hover {
    background-color: rgba(37, 99, 235, 0.16);
  }

  @media (prefers-color-scheme: dark) {
    .btn-manager-link {
      color: #60a5fa;
      border-color: rgba(96, 165, 250, 0.35);
      background-color: rgba(96, 165, 250, 0.12);
    }
  }

  /* Mode Tab Switcher */
  .tab-switcher {
    display: flex;
    background-color: #e2e8f0;
    border-radius: 8px;
    padding: 2.5px;
  }

  .tab-btn {
    flex: 1;
    border: none;
    background: transparent;
    padding: 0.35rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: #64748b;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .tab-btn.active {
    background-color: #ffffff;
    color: #0f172a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  @media (prefers-color-scheme: dark) {
    .tab-switcher {
      background-color: #27272a;
    }
    .tab-btn {
      color: #a1a1aa;
    }
    .tab-btn.active {
      background-color: #3f3f46;
      color: #ffffff;
    }
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

  .pinned-notice {
    font-size: 0.74rem;
    color: #475569;
    background: rgba(148, 163, 184, 0.12);
    border: 1px dashed rgba(148, 163, 184, 0.35);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    text-align: center;
    line-height: 1.3;
  }

  @media (prefers-color-scheme: dark) {
    .pinned-notice {
      color: #94a3b8;
      background: rgba(148, 163, 184, 0.08);
      border-color: rgba(148, 163, 184, 0.25);
    }
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
    max-width: 210px;
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

  .btn-action.btn-save {
    background-color: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .btn-action.btn-save:hover:not(:disabled) {
    background-color: #e2e8f0;
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
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
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

  /* In-Popup Bookmarks Styles */
  .bookmarks-panel {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .b-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .b-back-btn {
    border: 1px solid rgba(128, 128, 128, 0.2);
    background: transparent;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    color: inherit;
    white-space: nowrap;
  }

  .b-back-btn:hover {
    background-color: rgba(128, 128, 128, 0.1);
  }

  .b-search-input {
    flex: 1;
    padding: 0.35rem 0.6rem;
    font-size: 0.78rem;
    border: 1px solid rgba(128, 128, 128, 0.2);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    outline: none;
  }

  .b-search-input:focus {
    border-color: #2563eb;
  }

  .b-list {
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .b-empty {
    text-align: center;
    padding: 1.5rem 0.5rem;
    font-size: 0.8rem;
    opacity: 0.6;
  }

  .b-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    border: 1px solid rgba(128, 128, 128, 0.12);
    background-color: rgba(128, 128, 128, 0.04);
    transition: all 0.12s ease;
  }

  .b-item:hover {
    background-color: rgba(128, 128, 128, 0.08);
  }

  .b-item.dragging {
    opacity: 0.35;
  }

  .b-item.drop-before {
    border-top: 2px solid #2563eb;
  }

  .b-item.drop-after {
    border-bottom: 2px solid #2563eb;
  }

  .b-item.drop-folder {
    outline: 2px dashed #2563eb;
  }

  .b-drag-handle {
    cursor: grab;
    font-size: 0.75rem;
    opacity: 0.4;
    user-select: none;
  }

  .b-badge {
    width: 24px;
    height: 24px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.68rem;
    color: #ffffff;
    flex-shrink: 0;
  }

  .b-badge-folder {
    background-color: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .b-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }

  .b-title {
    font-size: 0.8rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .b-meta {
    font-size: 0.7rem;
    opacity: 0.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .b-actions {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .b-action-btn {
    border: none;
    background: transparent;
    padding: 0.2rem 0.3rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
  }

  .b-action-btn:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.15);
  }

  .b-action-btn.b-delete:hover {
    background-color: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .b-footer {
    border-top: 1px solid rgba(128, 128, 128, 0.15);
    padding-top: 0.5rem;
    text-align: center;
  }

  .btn-full-manager {
    width: 100%;
    border: 1px solid #2563eb;
    background-color: rgba(37, 99, 235, 0.08);
    color: #2563eb;
    padding: 0.4rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-full-manager:hover {
    background-color: #2563eb;
    color: #ffffff;
  }

  @media (prefers-color-scheme: dark) {
    .btn-full-manager {
      border-color: #3b82f6;
      color: #60a5fa;
      background-color: rgba(59, 130, 246, 0.12);
    }
    .btn-full-manager:hover {
      background-color: #3b82f6;
      color: #ffffff;
    }
  }
</style>
