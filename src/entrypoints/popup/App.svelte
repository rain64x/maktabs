<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    stashCurrentTab,
    stashAllTabs,
    getStashableTabsInfo,
    getOrCreateMakTabsFolder,
    getFolderContents,
    createFolderNode,
    moveBookmarkItem,
    deleteBookmarkNode,
    openBookmarkUrl,
    restoreAndOptionallyRemoveFolder,
    getMemorySaverPreference,
    searchBookmarksApi,
    extractDomain,
    getDomainInitial,
    getDomainColor,
    getDestinationFolders,
    getRecentDestinationIds,
    getDefaultSessionTitle,
    type BookmarkItem,
    type DestinationFolderOption,
    type BreadcrumbSegment,
  } from '@/lib/bookmarks';
  import FaviconBadge from '@/lib/FaviconBadge.svelte';

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
  let currentTabTitle = $state('');

  let canExecute = $derived(
    target === 'window'
      ? totalValidTabs === null || totalValidTabs > 0
      : isCurrentValid
  );

  // Destination Path & Folder State
  let isPathExpanded = $state(false);
  let destinationNameInput = $state('');
  let selectedFolderId = $state('');
  let folderSearchQuery = $state('');
  let destinationFolders = $state<DestinationFolderOption[]>([]);
  let recentFolderIds = $state<string[]>([]);
  let isFoldersLoading = $state(false);
  let isCreatingSubfolder = $state(false);
  let newSubfolderName = $state('');

  // Subfolder mode is automatically active whenever a subfolder name is entered
  let isSubfolderActive = $derived(destinationNameInput.trim().length > 0);

  let recentIdSet = $derived(new Set(recentFolderIds));

  let filteredDestinationFolders = $derived.by(() => {
    const q = folderSearchQuery.trim().toLowerCase();
    if (q) {
      return destinationFolders.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q)
      );
    }

    // When not searching, order list with:
    // 1. makTabs root first
    // 2. Recent folders (up to 4, excluding makTabs root)
    // 3. All remaining folders
    const makTabsRoot = destinationFolders.find((f) => f.isMakTabsRoot);

    const recents = recentFolderIds
      .map((id) => destinationFolders.find((f) => f.id === id))
      .filter((f): f is DestinationFolderOption => f !== undefined && !f.isMakTabsRoot)
      .slice(0, 4);

    const shownIds = new Set<string>();
    if (makTabsRoot) shownIds.add(makTabsRoot.id);
    recents.forEach((r) => shownIds.add(r.id));

    const remaining = destinationFolders.filter((f) => !shownIds.has(f.id));

    return [
      ...(makTabsRoot ? [makTabsRoot] : []),
      ...recents,
      ...remaining,
    ];
  });

  let selectedFolder = $derived(
    destinationFolders.find((f) => f.id === selectedFolderId)
  );

  let activeBreadcrumbs = $derived.by<BreadcrumbSegment[]>(() => {
    if (!selectedFolder) return [];
    return selectedFolder.breadcrumbs || [{ id: selectedFolder.id, title: selectedFolder.title }];
  });

  // In-Popup Bookmarks State
  let rootMakTabsId = $state<string>('');
  let currentFolderId = $state<string>('');
  let folderHistory = $state<{ id: string; title: string }[]>([]);
  let bookmarkItems = $state<BookmarkItem[]>([]);
  let searchQuery = $state('');
  let isBookmarksLoading = $state(false);
  let globalSearchResults = $state<BookmarkItem[]>([]);
  let isSearchingGlobal = $state(false);
  let searchDebounceTimer: number | null = null;

  // Drag and Drop State for Popup
  let draggedItem = $state<BookmarkItem | null>(null);
  let dragOverItemId = $state<string | null>(null);
  let dropPosition = $state<'before' | 'after' | 'folder' | null>(null);

  $effect(() => {
    const q = searchQuery.trim();
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (q.length >= 2) {
      isSearchingGlobal = true;
      searchDebounceTimer = window.setTimeout(async () => {
        globalSearchResults = await searchBookmarksApi(q);
      }, 150);
    } else {
      isSearchingGlobal = false;
      globalSearchResults = [];
    }
  });

  let filteredBookmarks = $derived.by(() => {
    if (isSearchingGlobal) return globalSearchResults;
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
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs[0]) {
        currentTabTitle = activeTabs[0].title || '';
      }
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

  async function initDestinationFolders() {
    isFoldersLoading = true;
    try {
      const [folders, recents, makTabsId] = await Promise.all([
        getDestinationFolders(),
        getRecentDestinationIds(),
        getOrCreateMakTabsFolder(),
      ]);
      destinationFolders = folders;
      recentFolderIds = recents;
      rootMakTabsId = makTabsId;

      // Always default directly to makTabs, never remember previous folder
      const makTabsRoot = folders.find((f) => f.isMakTabsRoot);
      selectedFolderId = makTabsRoot?.id || makTabsId;
    } catch (err) {
      console.error('Failed to init destination folders:', err);
    } finally {
      isFoldersLoading = false;
    }
  }

  onMount(async () => {
    await refreshTabInfo();
    memorySaver = await getMemorySaverPreference();
    await initDestinationFolders();
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

  function togglePathExpanded() {
    isPathExpanded = !isPathExpanded;
  }

  function selectDestinationFolder(folderId: string) {
    selectedFolderId = folderId;
    isCreatingSubfolder = false;
  }

  function toggleCreateSubfolder() {
    if (isSubfolderActive) {
      destinationNameInput = '';
    } else {
      destinationNameInput =
        target === 'window'
          ? getDefaultSessionTitle(totalValidTabs || 1)
          : currentTabTitle || 'Tab Bookmark';
    }
  }

  async function handleCreateSubfolder() {
    const name = newSubfolderName.trim();
    if (!name || !selectedFolderId) return;
    try {
      const created = await createFolderNode(selectedFolderId, name);
      destinationFolders = await getDestinationFolders();
      selectedFolderId = created.id;
      isCreatingSubfolder = false;
      newSubfolderName = '';
    } catch (err) {
      console.error('Failed to create subfolder:', err);
    }
  }

  async function executeStash(closeAfter: boolean) {
    if (isProcessing || !canExecute) return;
    isProcessing = true;
    status = { type: 'idle', message: '' };

    const targetFolderId = selectedFolderId || rootMakTabsId;
    const customTitle = destinationNameInput.trim();
    const willCreateSubfolder = customTitle.length > 0;

    try {
      const res =
        target === 'window'
          ? await stashAllTabs(closeAfter, targetFolderId, customTitle, willCreateSubfolder)
          : await stashCurrentTab(closeAfter, targetFolderId, customTitle, willCreateSubfolder);

      status = {
        type: res.success ? 'success' : 'warning',
        message: res.message,
      };
      if (res.success) {
        isPathExpanded = false;
      }
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

  async function openFullManager() {
    const managerUrl = browser.runtime.getURL('/manager.html');
    try {
      const tabs = await browser.tabs.query({ currentWindow: true });
      const existing = tabs.find((t) => t.url && t.url.startsWith(managerUrl));
      if (existing?.id) {
        await browser.tabs.update(existing.id, { active: true, pinned: true });
        return;
      }
    } catch {
      // Fallback to tabs.create
    }
    await browser.tabs.create({ url: managerUrl, pinned: true });
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
  <!-- Unified Compact Header -->
  <header>
    <div class="header-left">
      <img src="/logo.svg" alt="MakTabs logo" class="logo-img" width="20" height="20" />
      <h1 class="logo-title">MakTabs</h1>
    </div>

    <div class="header-right">
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

      <button
        type="button"
        class="btn-manager-icon"
        onclick={openFullManager}
        title="Open full Bookmarks Manager in new tab"
        aria-label="Open Bookmarks Manager"
      >
        ↗
      </button>
    </div>
  </header>

  <!-- View 1: Fast Stash -->
  {#if activeTab === 'stash'}
    <div class="panel">
      <!-- Row 1: Target Segmented Pill -->
      <div class="control-row">
        <span class="label">Scope:</span>
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

      <!-- Row 2: Target Path Preview & Expandable Selector -->
      <div class="path-section {isPathExpanded ? 'expanded' : ''}">
        <div class="path-summary-bar">
          <div
            class="path-summary-info"
            onclick={togglePathExpanded}
            role="button"
            tabindex="0"
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && togglePathExpanded()}
            title="Click to customize destination folder or subfolder"
          >
            <span class="path-summary-label">Save to:</span>
            <div class="path-summary-pill">
              <span class="path-pill-icon">{selectedFolder?.isMakTabsRoot ? '⚡' : '📁'}</span>
              <span class="path-pill-title" title={selectedFolder?.path || 'makTabs'}>
                {selectedFolder?.path || selectedFolder?.title || 'makTabs'}
                {#if isSubfolderActive}
                  <span class="path-subfolder-crumb">› {destinationNameInput.trim()}</span>
                {/if}
              </span>
              <span class="path-mode-badge {isSubfolderActive ? 'badge-subfolder' : 'badge-direct'}">
                {isSubfolderActive ? '📁 subfolder' : '⚡ direct'}
              </span>
            </div>
          </div>

          <button
            type="button"
            class="btn-path-toggle {isPathExpanded ? 'active' : ''}"
            onclick={togglePathExpanded}
            title={isPathExpanded ? 'Collapse options' : 'Change destination'}
            aria-expanded={isPathExpanded}
          >
            <span>{isPathExpanded ? 'Done' : 'Change'}</span>
            <span class="toggle-icon">{isPathExpanded ? '▴' : '▾'}</span>
          </button>
        </div>

        <!-- Expanded Extra Options -->
        {#if isPathExpanded}
          <div class="path-expanded-card">
            <!-- Interactive Breadcrumb Path Builder -->
            <div class="path-builder-card">
              <div class="path-header-row">
                <span class="path-title-label">Path Builder:</span>
                <button
                  type="button"
                  class="btn-subfolder-toggle {isSubfolderActive ? 'active' : ''}"
                  onclick={toggleCreateSubfolder}
                  title={isSubfolderActive ? "Click to save directly into selected folder without an extra subfolder" : "Click to wrap tabs in a subfolder"}
                >
                  {isSubfolderActive ? '📁 Subfolder' : '⚡ Direct save'}
                </button>
              </div>

              <!-- Dynamic Path Chain -->
              <div class="path-chain">
                {#each activeBreadcrumbs as crumb, i}
                  {@const isLastCrumb = i === activeBreadcrumbs.length - 1}
                  <button
                    type="button"
                    class="path-pill {isLastCrumb ? 'active-target' : ''}"
                    onclick={() => selectDestinationFolder(crumb.id)}
                    title="Click to set destination to {crumb.title}"
                  >
                    <span class="pill-icon">{i === 0 ? '⚡' : '📁'}</span>
                    <span class="pill-title">{crumb.title}</span>
                  </button>
                  <span class="path-chevron">›</span>
                {/each}

                <!-- Terminal Session Name Input -->
                <div class="path-terminal-input-wrap">
                  <input
                    id="dest-name"
                    type="text"
                    class="path-terminal-input"
                    bind:value={destinationNameInput}
                    placeholder={selectedFolder ? `Direct in ${selectedFolder.title}` : 'Session Name'}
                    title="Enter session subfolder name, or leave empty for direct save"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') executeStash(false);
                    }}
                  />
                  {#if destinationNameInput}
                    <button
                      type="button"
                      class="btn-clear-terminal"
                      onclick={() => (destinationNameInput = '')}
                      title="Clear to save directly without a subfolder"
                      aria-label="Clear subfolder name"
                    >
                      ✕
                    </button>
                  {/if}
                </div>
              </div>

              <!-- Path Mode Description -->
              <div class="path-feedback-caption">
                {#if isSubfolderActive}
                  <span class="feedback-text">
                    📁 Will create subfolder <strong>"{destinationNameInput.trim()}"</strong> inside <strong>{selectedFolder?.path || selectedFolder?.title || 'makTabs'}</strong>
                  </span>
                {:else}
                  <span class="feedback-text feedback-direct">
                    ⚡ Tabs will be saved directly into <strong>{selectedFolder?.path || selectedFolder?.title || 'makTabs'}</strong>
                  </span>
                {/if}
              </div>
            </div>

            <!-- Folders Search & List with + New Subfolder button -->
            <div class="folder-section">
              <div class="folder-header-row">
                <span class="modal-subheading">
                  {folderSearchQuery ? 'Matching Folders' : 'Select Destination Folder'}
                </span>
                <button
                  type="button"
                  class="btn-new-subfolder-toggle"
                  onclick={() => {
                    isCreatingSubfolder = !isCreatingSubfolder;
                    if (isCreatingSubfolder) newSubfolderName = '';
                  }}
                  title="Create a new subfolder under {selectedFolder?.path || selectedFolder?.title || 'selected folder'}"
                >
                  {isCreatingSubfolder ? '✕ Cancel' : '+ New Subfolder'}
                </button>
              </div>

              <!-- Inline New Subfolder Creator -->
              {#if isCreatingSubfolder}
                <div class="inline-create-box">
                  <span class="create-box-label">
                    New subfolder in <strong>{selectedFolder?.path || selectedFolder?.title || 'makTabs'}</strong>:
                  </span>
                  <div class="create-box-row">
                    <input
                      type="text"
                      class="create-box-input"
                      placeholder="Subfolder name (e.g. music, flute)..."
                      bind:value={newSubfolderName}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') handleCreateSubfolder();
                        if (e.key === 'Escape') isCreatingSubfolder = false;
                      }}
                    />
                    <button
                      type="button"
                      class="btn-create-submit"
                      onclick={handleCreateSubfolder}
                      disabled={!newSubfolderName.trim()}
                    >
                      Create
                    </button>
                  </div>
                </div>
              {/if}

              <!-- Search input -->
              <div class="search-box">
                <span class="search-box-icon">🔍</span>
                <input
                  type="search"
                  class="modal-input search-box-input"
                  placeholder="Filter or search folders..."
                  bind:value={folderSearchQuery}
                />
                {#if folderSearchQuery}
                  <button
                    type="button"
                    class="search-clear-btn"
                    onclick={() => (folderSearchQuery = '')}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                {/if}
              </div>

              <div class="folder-options-list" role="listbox">
                {#if isFoldersLoading}
                  <div class="folder-option-empty">Loading folders...</div>
                {:else if filteredDestinationFolders.length === 0}
                  <div class="folder-option-empty">
                    {folderSearchQuery
                      ? `No folders match "${folderSearchQuery}"`
                      : 'No folders found'}
                  </div>
                {:else}
                  {#each filteredDestinationFolders as folder (folder.id)}
                    {@const isSelected = selectedFolderId === folder.id}
                    {@const isRecent = !folderSearchQuery && recentIdSet.has(folder.id) && !folder.isMakTabsRoot}
                    <div
                      class="folder-option {isSelected ? 'selected' : ''} {folder.isUnderMakTabs ? 'under-maktabs' : ''}"
                      role="option"
                      aria-selected={isSelected}
                      tabindex="0"
                      onclick={() => selectDestinationFolder(folder.id)}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') selectDestinationFolder(folder.id);
                      }}
                    >
                      <span class="folder-option-icon">
                        {folder.isMakTabsRoot ? '⚡' : '📁'}
                      </span>
                      <span class="folder-option-path" title={folder.path}>
                        {folder.path}
                      </span>
                      {#if isRecent}
                        <span class="folder-recent-badge" title="Recently used destination">recent</span>
                      {/if}
                      {#if isSelected}
                        <span class="folder-option-check">✓</span>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Row 3: Action Buttons -->
      <div class="action-btn-group">
        <button
          type="button"
          class="btn-sm btn-action btn-close"
          onclick={() => executeStash(true)}
          disabled={isProcessing || !canExecute}
          title={target === 'this' && isCurrentPinned
            ? 'Pinned tabs are protected'
            : 'Save target tab(s) to destination and close them'}
        >
          {isProcessing ? 'Saving...' : 'Save and Close'}
        </button>
        <button
          type="button"
          class="btn-sm btn-action btn-save"
          onclick={() => executeStash(false)}
          disabled={isProcessing || !canExecute}
          title={target === 'this' && isCurrentPinned
            ? 'Pinned tabs are protected'
            : 'Save target tab(s) to destination without closing'}
        >
          {isProcessing ? 'Saving...' : 'Save only'}
        </button>
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
                  {#if isSearchingGlobal && item.locationPath && !item.isDirectlyUnderMakTabs}
                    <button
                      type="button"
                      class="b-location-btn"
                      title="Folder location: {item.locationPath}"
                      onclick={(e) => {
                        e.stopPropagation();
                        if (item.parentId) {
                          searchQuery = '';
                          navigateIntoFolder({ id: item.parentId, title: item.locationPath || 'Folder' });
                        }
                      }}
                    >
                      📁 {item.locationPath}
                    </button>
                  {/if}
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
                <FaviconBadge
                  url={item.url}
                  title={item.title}
                  {domain}
                  {initial}
                  {badgeColor}
                  size="popup"
                />
                <div
                  class="b-info"
                  onclick={() => handleOpenBookmark(item)}
                  onkeydown={(e) => e.key === 'Enter' && handleOpenBookmark(item)}
                  role="button"
                  tabindex="0"
                  title={item.url}
                >
                  <span class="b-title">{item.title}</span>
                  {#if isSearchingGlobal && item.locationPath && !item.isDirectlyUnderMakTabs}
                    <button
                      type="button"
                      class="b-location-btn"
                      title="Folder location: {item.locationPath}"
                      onclick={(e) => {
                        e.stopPropagation();
                        if (item.parentId) {
                          searchQuery = '';
                          navigateIntoFolder({ id: item.parentId, title: item.locationPath || 'Folder' });
                        }
                      }}
                    >
                      📁 {item.locationPath}
                    </button>
                  {/if}
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
    width: 390px;
    padding: 0.65rem 0.75rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    position: relative;
    max-height: 580px;
    overflow-y: auto;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .logo-img {
    border-radius: 4px;
    display: block;
  }

  .logo-title {
    font-size: 0.98rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .btn-manager-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 700;
    border-radius: 6px;
    border: 1px solid rgba(37, 99, 235, 0.3);
    background-color: rgba(37, 99, 235, 0.08);
    color: #2563eb;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .btn-manager-icon:hover {
    background-color: rgba(37, 99, 235, 0.18);
    border-color: #2563eb;
  }

  @media (prefers-color-scheme: dark) {
    .btn-manager-icon {
      color: #60a5fa;
      border-color: rgba(96, 165, 250, 0.35);
      background-color: rgba(96, 165, 250, 0.12);
    }
  }

  /* Mode Tab Switcher */
  .tab-switcher {
    display: flex;
    background-color: #e2e8f0;
    border-radius: 6px;
    padding: 2px;
  }

  .tab-btn {
    border: none;
    background: transparent;
    padding: 0.22rem 0.5rem;
    font-size: 0.73rem;
    font-weight: 600;
    color: #64748b;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
    white-space: nowrap;
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
    gap: 0.5rem;
    background: rgba(128, 128, 128, 0.05);
    border: 1px solid rgba(128, 128, 128, 0.12);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
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
    max-width: 240px;
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

  .action-btn-group {
    display: flex;
    gap: 0.45rem;
    width: 100%;
    margin-top: 0.1rem;
  }

  .action-btn-group .btn-action {
    flex: 1;
    padding: 0.42rem 0.55rem;
    font-size: 0.78rem;
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

  /* Path Section & Expandable Selector */
  .path-section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(128, 128, 128, 0.05);
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 6px;
    padding: 0.32rem 0.45rem;
    transition: all 0.18s ease;
  }

  .path-section.expanded {
    background: rgba(128, 128, 128, 0.08);
    border-color: rgba(37, 99, 235, 0.35);
  }

  @media (prefers-color-scheme: dark) {
    .path-section.expanded {
      border-color: rgba(96, 165, 250, 0.4);
    }
  }

  .path-summary-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .path-summary-info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }

  .path-summary-label {
    font-size: 0.78rem;
    font-weight: 600;
    opacity: 0.75;
    white-space: nowrap;
    user-select: none;
  }

  .path-summary-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.18rem 0.45rem;
    background-color: #ffffff;
    border: 1px solid rgba(128, 128, 128, 0.22);
    border-radius: 6px;
    font-size: 0.74rem;
    font-weight: 500;
    flex: 1;
    min-width: 0;
    transition: all 0.12s ease;
  }

  .path-summary-pill:hover {
    border-color: rgba(37, 99, 235, 0.4);
    background-color: rgba(37, 99, 235, 0.04);
  }

  @media (prefers-color-scheme: dark) {
    .path-summary-pill {
      background-color: #27272a;
      border-color: #3f3f46;
    }
    .path-summary-pill:hover {
      background-color: rgba(96, 165, 250, 0.08);
      border-color: rgba(96, 165, 250, 0.4);
    }
  }

  .path-pill-icon {
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .path-pill-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: #1e293b;
    flex: 1;
  }

  @media (prefers-color-scheme: dark) {
    .path-pill-title {
      color: #f1f5f9;
    }
  }

  .path-subfolder-crumb {
    font-weight: 500;
    color: #2563eb;
    margin-left: 0.15rem;
  }

  @media (prefers-color-scheme: dark) {
    .path-subfolder-crumb {
      color: #93c5fd;
    }
  }

  .path-mode-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.05rem 0.35rem;
    border-radius: 9999px;
    text-transform: lowercase;
    flex-shrink: 0;
  }

  .badge-direct {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .badge-subfolder {
    background: rgba(37, 99, 235, 0.12);
    color: #2563eb;
    border: 1px solid rgba(37, 99, 235, 0.25);
  }

  @media (prefers-color-scheme: dark) {
    .badge-direct {
      background: rgba(52, 211, 153, 0.16);
      color: #34d399;
      border-color: rgba(52, 211, 153, 0.3);
    }
    .badge-subfolder {
      background: rgba(96, 165, 250, 0.16);
      color: #93c5fd;
      border-color: rgba(96, 165, 250, 0.3);
    }
  }

  .btn-path-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.22rem 0.5rem;
    border: 1px solid rgba(128, 128, 128, 0.25);
    background: transparent;
    color: inherit;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s ease;
    flex-shrink: 0;
  }

  .btn-path-toggle:hover {
    background-color: rgba(128, 128, 128, 0.12);
  }

  .btn-path-toggle.active {
    background-color: #2563eb;
    color: #ffffff;
    border-color: #1d4ed8;
  }

  @media (prefers-color-scheme: dark) {
    .btn-path-toggle.active {
      background-color: #3b82f6;
      border-color: #60a5fa;
    }
  }

  .toggle-icon {
    font-size: 0.65rem;
  }

  .path-expanded-card {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding-top: 0.35rem;
    border-top: 1px dashed rgba(128, 128, 128, 0.18);
    animation: fadeIn 0.15s ease-out;
  }

  /* Interactive Breadcrumb Path Builder Card */
  .path-builder-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(128, 128, 128, 0.06);
    border: 1px solid rgba(128, 128, 128, 0.18);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
  }

  .path-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .path-title-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.7;
  }

  .btn-subfolder-toggle {
    border: 1px solid rgba(128, 128, 128, 0.25);
    background: transparent;
    padding: 0.15rem 0.45rem;
    border-radius: 9999px;
    font-size: 0.69rem;
    font-weight: 600;
    cursor: pointer;
    color: inherit;
    transition: all 0.15s ease;
  }

  .btn-subfolder-toggle.active {
    background: rgba(37, 99, 235, 0.12);
    color: #2563eb;
    border-color: rgba(37, 99, 235, 0.35);
  }

  @media (prefers-color-scheme: dark) {
    .btn-subfolder-toggle.active {
      background: rgba(96, 165, 250, 0.16);
      color: #93c5fd;
      border-color: rgba(96, 165, 250, 0.35);
    }
  }

  /* Breadcrumb Chain Container */
  .path-chain {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.3rem;
    background: #ffffff;
    border: 1px solid rgba(128, 128, 128, 0.22);
    border-radius: 6px;
    padding: 0.3rem 0.45rem;
  }

  @media (prefers-color-scheme: dark) {
    .path-chain {
      background: #27272a;
      border-color: #3f3f46;
    }
  }

  .path-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid rgba(128, 128, 128, 0.2);
    background: rgba(128, 128, 128, 0.08);
    border-radius: 4px;
    padding: 0.12rem 0.35rem;
    font-size: 0.71rem;
    font-weight: 500;
    cursor: pointer;
    color: inherit;
    transition: all 0.12s ease;
  }

  .path-pill:hover {
    background: rgba(37, 99, 235, 0.12);
    border-color: rgba(37, 99, 235, 0.3);
    color: #2563eb;
  }

  .path-pill.active-target {
    background: rgba(37, 99, 235, 0.15);
    border-color: #2563eb;
    color: #2563eb;
    font-weight: 600;
  }

  @media (prefers-color-scheme: dark) {
    .path-pill.active-target {
      background: rgba(96, 165, 250, 0.18);
      border-color: #60a5fa;
      color: #93c5fd;
    }
  }

  .pill-icon {
    font-size: 0.7rem;
  }

  .pill-title {
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path-chevron {
    font-size: 0.8rem;
    font-weight: bold;
    opacity: 0.4;
    user-select: none;
  }

  /* Terminal Session Name Input */
  .path-terminal-input-wrap {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 110px;
    position: relative;
  }

  .path-terminal-input {
    width: 100%;
    border: none;
    background: transparent;
    padding: 0.15rem 1.2rem 0.15rem 0.2rem;
    font-size: 0.73rem;
    font-weight: 600;
    color: #2563eb;
    outline: none;
  }

  .path-terminal-input::placeholder {
    color: rgba(128, 128, 128, 0.65);
    font-weight: 400;
    font-style: italic;
  }

  @media (prefers-color-scheme: dark) {
    .path-terminal-input {
      color: #60a5fa;
    }
  }

  .btn-clear-terminal {
    position: absolute;
    right: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.7rem;
    opacity: 0.5;
    padding: 0.1rem;
    color: inherit;
  }

  .btn-clear-terminal:hover {
    opacity: 1;
  }

  .path-feedback-caption {
    font-size: 0.68rem;
    line-height: 1.25;
  }

  .feedback-text {
    color: #475569;
  }

  .feedback-text.feedback-direct {
    color: #059669;
  }

  @media (prefers-color-scheme: dark) {
    .feedback-text {
      color: #94a3b8;
    }
    .feedback-text.feedback-direct {
      color: #34d399;
    }
  }

  .modal-field-folder {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  /* Folder Header Row with + New Subfolder */
  .folder-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .btn-new-subfolder-toggle {
    border: 1px dashed rgba(37, 99, 235, 0.4);
    background: rgba(37, 99, 235, 0.05);
    color: #2563eb;
    font-size: 0.69rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-new-subfolder-toggle:hover {
    background: rgba(37, 99, 235, 0.12);
    border-style: solid;
  }

  @media (prefers-color-scheme: dark) {
    .btn-new-subfolder-toggle {
      color: #93c5fd;
      border-color: rgba(96, 165, 250, 0.4);
      background: rgba(96, 165, 250, 0.08);
    }
    .btn-new-subfolder-toggle:hover {
      background: rgba(96, 165, 250, 0.16);
    }
  }

  /* Inline Create Subfolder Box */
  .inline-create-box {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    background: rgba(37, 99, 235, 0.06);
    border: 1px solid rgba(37, 99, 235, 0.25);
    border-radius: 6px;
    padding: 0.4rem 0.5rem;
    animation: fadeIn 0.12s ease-out;
  }

  @media (prefers-color-scheme: dark) {
    .inline-create-box {
      background: rgba(96, 165, 250, 0.08);
      border-color: rgba(96, 165, 250, 0.3);
    }
  }

  .create-box-label {
    font-size: 0.69rem;
    opacity: 0.85;
  }

  .create-box-row {
    display: flex;
    gap: 0.35rem;
  }

  .create-box-input {
    flex: 1;
    padding: 0.25rem 0.45rem;
    font-size: 0.74rem;
    border-radius: 4px;
    border: 1px solid rgba(128, 128, 128, 0.25);
    background: #ffffff;
    color: inherit;
    outline: none;
  }

  .create-box-input:focus {
    border-color: #2563eb;
  }

  @media (prefers-color-scheme: dark) {
    .create-box-input {
      background: #18181b;
      border-color: #3f3f46;
    }
  }

  .btn-create-submit {
    border: none;
    background: #2563eb;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.25rem 0.55rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .btn-create-submit:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-create-submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .modal-subheading {
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .modal-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.38rem 0.6rem;
    font-size: 0.78rem;
    border-radius: 6px;
    border: 1px solid rgba(128, 128, 128, 0.25);
    background-color: rgba(128, 128, 128, 0.04);
    color: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .modal-input:focus {
    border-color: #2563eb;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .search-box-icon {
    position: absolute;
    left: 0.55rem;
    font-size: 0.72rem;
    opacity: 0.5;
    pointer-events: none;
  }

  .search-box-input {
    padding-left: 1.7rem;
    padding-right: 1.6rem;
  }

  .search-clear-btn {
    position: absolute;
    right: 0.45rem;
    border: none;
    background: transparent;
    cursor: pointer;
    opacity: 0.5;
    font-size: 0.75rem;
    color: inherit;
    padding: 0.1rem 0.25rem;
  }

  .search-clear-btn:hover {
    opacity: 1;
  }

  /* Folder Recent Badge */
  .folder-recent-badge {
    font-size: 0.63rem;
    font-weight: 600;
    padding: 0.05rem 0.35rem;
    border-radius: 9999px;
    background: rgba(37, 99, 235, 0.1);
    color: #2563eb;
    border: 1px solid rgba(37, 99, 235, 0.25);
    text-transform: lowercase;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .folder-recent-badge {
      background: rgba(96, 165, 250, 0.14);
      color: #93c5fd;
      border-color: rgba(96, 165, 250, 0.3);
    }
  }

  /* Folder Options List */
  .folder-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-height: 0;
  }

  .folder-options-list {
    max-height: 160px;
    overflow-y: auto;
    border: 1px solid rgba(128, 128, 128, 0.18);
    border-radius: 6px;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    background-color: rgba(128, 128, 128, 0.03);
  }

  .folder-option-empty {
    text-align: center;
    padding: 1rem 0.5rem;
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .folder-option {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.32rem 0.45rem;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.74rem;
    border: 1px solid transparent;
    transition: all 0.12s ease;
    user-select: none;
    outline: none;
  }

  .folder-option:hover {
    background-color: rgba(128, 128, 128, 0.08);
  }

  .folder-option.selected {
    background-color: rgba(37, 99, 235, 0.12);
    border-color: rgba(37, 99, 235, 0.35);
    font-weight: 600;
    color: #1d4ed8;
  }

  @media (prefers-color-scheme: dark) {
    .folder-option.selected {
      background-color: rgba(59, 130, 246, 0.2);
      border-color: rgba(59, 130, 246, 0.45);
      color: #93c5fd;
    }
  }

  .folder-option-icon {
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .folder-option-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-option-check {
    font-weight: 700;
    color: #2563eb;
    font-size: 0.78rem;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .folder-option-check {
      color: #60a5fa;
    }
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

  .b-location-btn {
    border: none;
    background: transparent;
    padding: 0;
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
    opacity: 0.85;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    display: block;
    max-width: 100%;
    transition: color 0.15s ease, opacity 0.15s ease;
  }

  .b-location-btn:hover {
    color: #2563eb;
    opacity: 1;
    text-decoration: underline;
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
