<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    MAKTABS_FOLDER_NAME,
    getOrCreateMakTabsFolder,
    getAllFoldersTree,
    getFullBookmarkTree,
    getFolderContents,
    isDescendant,
    moveBookmarkItem,
    createBookmarkNode,
    createFolderNode,
    updateBookmarkNode,
    deleteBookmarkNode,
    openBookmarkUrl,
    openFolderTabs,
    restoreAndOptionallyRemoveFolder,
    searchBookmarksApi,
    getLazyUrl,
    getMemorySaverPreference,
    setMemorySaverPreference,
    extractDomain,
    getDomainInitial,
    getDomainColor,
    type BookmarkItem,
    type FolderNode,
  } from '@/lib/bookmarks';
  import BookmarkTreeNode from './BookmarkTreeNode.svelte';
  import './manager.css';

  // Navigation & Data State
  let folderTree = $state<FolderNode[]>([]);
  let fullTree = $state<BookmarkItem[]>([]);
  let expandedFolderIds = $state<Set<string>>(new Set());
  let currentFolderId = $state<string>('');
  let currentFolderName = $state<string>('Loading...');
  let breadcrumbs = $state<{ id: string; title: string }[]>([]);
  let currentItems = $state<BookmarkItem[]>([]);
  let isLoading = $state(true);
  let memorySaver = $state(true);

  // Search & Filter State
  let searchQuery = $state('');
  let isGlobalSearch = $state(false);
  let searchResults = $state<BookmarkItem[]>([]);
  let sortOption = $state<'manual' | 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'>('manual');
  let viewMode = $state<'tree' | 'list' | 'grid'>('tree');

  // Drag and Drop State
  let draggedItem = $state<BookmarkItem | null>(null);
  let dragOverItemId = $state<string | null>(null);
  let dropPosition = $state<'before' | 'after' | 'folder' | null>(null);
  let sidebarDragOverFolderId = $state<string | null>(null);

  // Selection & Batch Operations
  let selectedIds = $state<Set<string>>(new Set());

  // Modal State
  let showAddModal = $state(false);
  let showFolderModal = $state(false);
  let showEditModal = $state(false);
  let showDeleteConfirmModal = $state(false);

  let targetParentFolderId = $state<string>('');
  let editingItem = $state<BookmarkItem | null>(null);
  let deletingItem = $state<BookmarkItem | null>(null);

  let formTitle = $state('');
  let formUrl = $state('');
  let formError = $state('');

  // Status Notification
  let notification = $state<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  let notificationTimer: number | null = null;

  function showNotification(message: string, type: 'info' | 'success' | 'error' = 'info') {
    if (notificationTimer) clearTimeout(notificationTimer);
    notification = { type, message };
    notificationTimer = window.setTimeout(() => {
      notification = null;
    }, 4000);
  }

  // Filtered Tree (when searching in Tree view)
  let displayedTree = $derived.by(() => {
    if (!searchQuery.trim()) return fullTree;
    const q = searchQuery.toLowerCase().trim();

    function filterNode(node: BookmarkItem): BookmarkItem | null {
      const matchesTitle = node.title.toLowerCase().includes(q);
      const matchesUrl = node.url && node.url.toLowerCase().includes(q);

      if (!node.url && node.children) {
        const filteredChildren = node.children
          .map(filterNode)
          .filter((c): c is BookmarkItem => c !== null);

        if (matchesTitle || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
        return null;
      }

      return matchesTitle || matchesUrl ? node : null;
    }

    return fullTree.map(filterNode).filter((n): n is BookmarkItem => n !== null);
  });

  // Derived Display List for List/Grid view
  let displayedItems = $derived.by(() => {
    let items = isGlobalSearch ? searchResults : currentItems;

    if (!isGlobalSearch && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (i) => i.title.toLowerCase().includes(q) || (i.url && i.url.toLowerCase().includes(q))
      );
    }

    if (sortOption === 'manual') return items;

    const sorted = [...items];
    if (sortOption === 'name-asc') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOption === 'name-desc') {
      sorted.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortOption === 'date-desc') {
      sorted.sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
    } else if (sortOption === 'date-asc') {
      sorted.sort((a, b) => (a.dateAdded ?? 0) - (b.dateAdded ?? 0));
    }
    return sorted;
  });

  let folderItemCount = $derived(
    currentItems.filter((i) => !i.url).length
  );
  let bookmarkItemCount = $derived(
    currentItems.filter((i) => Boolean(i.url)).length
  );

  let isCurrentMakTabsSession = $derived(
    !isGlobalSearch &&
      breadcrumbs.some((b) => b.title === MAKTABS_FOLDER_NAME) &&
      currentFolderName !== MAKTABS_FOLDER_NAME
  );

  // Lifecycle & Listeners
  onMount(() => {
    initManager();
    getMemorySaverPreference().then((val) => {
      memorySaver = val;
    });

    const handleBookmarkChange = () => {
      loadTrees();
      reloadFolder();
    };

    browser.bookmarks.onCreated.addListener(handleBookmarkChange);
    browser.bookmarks.onRemoved.addListener(handleBookmarkChange);
    browser.bookmarks.onChanged.addListener(handleBookmarkChange);
    browser.bookmarks.onMoved.addListener(handleBookmarkChange);
    browser.bookmarks.onChildrenReordered?.addListener(handleBookmarkChange);

    return () => {
      browser.bookmarks.onCreated.removeListener(handleBookmarkChange);
      browser.bookmarks.onRemoved.removeListener(handleBookmarkChange);
      browser.bookmarks.onChanged.removeListener(handleBookmarkChange);
      browser.bookmarks.onMoved.removeListener(handleBookmarkChange);
      browser.bookmarks.onChildrenReordered?.removeListener(handleBookmarkChange);
    };
  });

  onDestroy(() => {
    if (notificationTimer) clearTimeout(notificationTimer);
  });

  async function initManager() {
    isLoading = true;
    try {
      await loadTrees();
      const makTabsId = await getOrCreateMakTabsFolder();
      expandedFolderIds.add(makTabsId);
      expandedFolderIds = new Set(expandedFolderIds);
      await navigateToFolder(makTabsId, MAKTABS_FOLDER_NAME);
    } catch (err) {
      console.error('Failed to initialize Bookmarks Manager:', err);
    } finally {
      isLoading = false;
    }
  }

  async function loadTrees() {
    folderTree = await getAllFoldersTree();
    fullTree = await getFullBookmarkTree();
    // Expand root folders initially
    if (expandedFolderIds.size === 0) {
      for (const root of fullTree) {
        expandedFolderIds.add(root.id);
      }
      expandedFolderIds = new Set(expandedFolderIds);
    }
  }

  async function navigateToFolder(folderId: string, folderName?: string) {
    isLoading = true;
    isGlobalSearch = false;
    searchQuery = '';
    selectedIds = new Set();
    currentFolderId = folderId;

    try {
      const crumbs: { id: string; title: string }[] = [];
      let lookupId: string | undefined = folderId;

      while (lookupId) {
        const currentLookup: string = lookupId;
        const nodes = await browser.bookmarks.get(currentLookup);
        const node = nodes[0];
        if (!node) break;
        crumbs.unshift({ id: node.id, title: node.title || 'Bookmarks' });
        const parent: string | undefined = node.parentId;
        lookupId = parent && parent !== '0' && parent !== 'root________'
          ? parent
          : undefined;
      }

      breadcrumbs = crumbs;
      currentFolderName = folderName || crumbs[crumbs.length - 1]?.title || 'Folder';
      expandedFolderIds.add(folderId);
      expandedFolderIds = new Set(expandedFolderIds);
      await reloadFolder();
    } catch (err) {
      console.error(`Failed to navigate to folder ${folderId}:`, err);
    } finally {
      isLoading = false;
    }
  }

  async function reloadFolder() {
    if (!currentFolderId) return;
    currentItems = await getFolderContents(currentFolderId);
    fullTree = await getFullBookmarkTree();
  }

  // Tree Expand / Collapse Helpers
  function toggleExpand(id: string) {
    if (expandedFolderIds.has(id)) {
      expandedFolderIds.delete(id);
    } else {
      expandedFolderIds.add(id);
    }
    expandedFolderIds = new Set(expandedFolderIds);
  }

  function expandAll() {
    const all = new Set<string>();
    function collectFolders(nodes: BookmarkItem[]) {
      for (const node of nodes) {
        if (!node.url) {
          all.add(node.id);
          if (node.children) collectFolders(node.children);
        }
      }
    }
    collectFolders(fullTree);
    expandedFolderIds = all;
  }

  function collapseAll() {
    expandedFolderIds = new Set();
  }

  // Search Functionality
  let searchDebounceTimer: number | null = null;
  function handleSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        if (viewMode !== 'tree') {
          isGlobalSearch = true;
          searchResults = await searchBookmarksApi(searchQuery);
        } else {
          // In tree mode, expand all matching folders so user sees the hits!
          expandAll();
        }
      } else if (!searchQuery.trim()) {
        isGlobalSearch = false;
        searchResults = [];
      }
    }, 150);
  }

  function clearSearch() {
    searchQuery = '';
    isGlobalSearch = false;
    searchResults = [];
  }

  // Drag and Drop: Moving Folders & Items
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
    sidebarDragOverFolderId = null;
  }

  function handleItemDragOver(e: DragEvent, targetItem: BookmarkItem) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) return;

    // Prevent dragging a folder into its own descendant!
    if (!draggedItem.url && isDescendant(draggedItem.id, targetItem.id, fullTree)) {
      return;
    }

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

    // Circular hierarchy protection
    if (!draggedItem.url && isDescendant(draggedItem.id, targetItem.id, fullTree)) {
      showNotification('Cannot move a folder into itself or its own subfolder', 'error');
      handleDragEnd();
      return;
    }

    const dragged = draggedItem;
    const pos = dropPosition;
    handleDragEnd();

    try {
      if (pos === 'folder' && !targetItem.url) {
        // Move folder or bookmark inside target folder
        await moveBookmarkItem(dragged.id, { parentId: targetItem.id });
        expandedFolderIds.add(targetItem.id);
        expandedFolderIds = new Set(expandedFolderIds);
        showNotification(
          `Moved ${dragged.url ? 'bookmark' : 'folder'} "${dragged.title}" into "${targetItem.title}"`,
          'success'
        );
      } else if (pos === 'before' || pos === 'after') {
        const targetParentId = targetItem.parentId || currentFolderId;
        const targetIndex = targetItem.index ?? 0;
        const sameFolder = dragged.parentId === targetParentId;
        const fromIdx = dragged.index ?? 0;

        let newIndex = targetIndex;
        if (sameFolder) {
          newIndex = pos === 'before'
            ? (fromIdx < targetIndex ? targetIndex - 1 : targetIndex)
            : (fromIdx < targetIndex ? targetIndex : targetIndex + 1);
        } else {
          newIndex = pos === 'before' ? targetIndex : targetIndex + 1;
        }

        await moveBookmarkItem(dragged.id, {
          parentId: targetParentId,
          index: Math.max(0, newIndex),
        });

        showNotification(
          `Moved "${dragged.title}" ${pos} "${targetItem.title}"`,
          'success'
        );
      }

      await loadTrees();
      await reloadFolder();
    } catch (err) {
      console.error('Failed to move bookmark or folder:', err);
      showNotification('Failed to move bookmark or folder', 'error');
    }
  }

  // Sidebar Drag and Drop
  function handleSidebarDragOver(e: DragEvent, folder: FolderNode) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === folder.id) return;
    if (!draggedItem.url && isDescendant(draggedItem.id, folder.id, fullTree)) return;

    sidebarDragOverFolderId = folder.id;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleSidebarDragLeave(folder: FolderNode) {
    if (sidebarDragOverFolderId === folder.id) {
      sidebarDragOverFolderId = null;
    }
  }

  async function handleSidebarDrop(e: DragEvent, folder: FolderNode) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === folder.id) {
      handleDragEnd();
      return;
    }

    if (!draggedItem.url && isDescendant(draggedItem.id, folder.id, fullTree)) {
      showNotification('Cannot move a folder into itself', 'error');
      handleDragEnd();
      return;
    }

    const dragged = draggedItem;
    handleDragEnd();

    try {
      await moveBookmarkItem(dragged.id, { parentId: folder.id });
      showNotification(
        `Moved ${dragged.url ? 'bookmark' : 'folder'} "${dragged.title}" to folder "${folder.title}"`,
        'success'
      );
      await loadTrees();
      await reloadFolder();
    } catch (err) {
      console.error('Failed to move to sidebar folder:', err);
      showNotification('Failed to move item', 'error');
    }
  }

  // Order Move Buttons for List View
  async function moveItemOrder(item: BookmarkItem, direction: 'up' | 'down') {
    const fromIdx = currentItems.findIndex((i) => i.id === item.id);
    if (fromIdx === -1) return;
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= currentItems.length) return;

    try {
      await moveBookmarkItem(item.id, { parentId: currentFolderId, index: toIdx });
      await reloadFolder();
      await loadTrees();
    } catch (err) {
      console.error('Failed to move order:', err);
    }
  }

  function toggleMemorySaver() {
    memorySaver = !memorySaver;
    setMemorySaverPreference(memorySaver);
    showNotification(
      memorySaver
        ? '⚡ Memory Saver ON: Tabs will pause to save RAM until focused'
        : '⚡ Memory Saver OFF: Tabs will load immediately',
      'info'
    );
  }

  // Bookmark / Session Operations
  async function handleOpenBookmark(item: BookmarkItem) {
    if (!item.url) {
      await navigateToFolder(item.id, item.title);
      return;
    }
    await openBookmarkUrl(item.url, true);
  }

  async function handleOpenAllInFolder(folderId: string, newWindow = false) {
    try {
      const count = await openFolderTabs(folderId, newWindow, memorySaver);
      showNotification(`Opened ${count} tabs${memorySaver ? ' (Memory Saver mode)' : ''}`, 'success');
    } catch (err) {
      showNotification('Failed to open folder tabs', 'error');
    }
  }

  async function handleRestoreSession(folderId: string, removeAfter: boolean) {
    try {
      const count = await restoreAndOptionallyRemoveFolder(folderId, removeAfter, false, memorySaver);
      showNotification(
        removeAfter
          ? `Restored ${count} tabs and removed session folder`
          : `Restored ${count} tabs${memorySaver ? ' (Memory Saver mode)' : ''}`,
        'success'
      );
      await loadTrees();
      await reloadFolder();
    } catch (err) {
      showNotification('Failed to restore session tabs', 'error');
    }
  }

  async function copyUrl(url?: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showNotification('URL copied to clipboard!', 'success');
    } catch {
      showNotification('Could not copy URL', 'error');
    }
  }

  // Selection & Batch Operations
  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  }

  async function openSelected() {
    let opened = 0;
    for (const id of selectedIds) {
      try {
        const nodes = await browser.bookmarks.get(id);
        const node = nodes[0];
        if (node?.url) {
          const finalUrl = memorySaver ? getLazyUrl(node.url, node.title) : node.url;
          await browser.tabs.create({ url: finalUrl, active: false });
          opened++;
        } else if (node) {
          opened += await openFolderTabs(node.id, false, memorySaver);
        }
      } catch {}
    }
    showNotification(`Opened ${opened} tabs${memorySaver ? ' (Memory Saver mode)' : ''}`, 'success');
  }

  async function deleteSelected() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} selected item(s)?`)) return;

    for (const id of selectedIds) {
      try {
        const nodes = await browser.bookmarks.get(id);
        const node = nodes[0];
        if (node) {
          await deleteBookmarkNode(node.id, !node.url);
        }
      } catch {}
    }
    selectedIds = new Set();
    showNotification(`Deleted ${count} item(s)`, 'success');
    await loadTrees();
    await reloadFolder();
  }

  // Modals: Add Bookmark / Folder / Edit / Delete
  function openAddBookmarkModal(folderId?: string) {
    targetParentFolderId = folderId || currentFolderId;
    formTitle = '';
    formUrl = 'https://';
    formError = '';
    showAddModal = true;
  }

  async function handleAddBookmarkSubmit() {
    if (!formUrl.trim()) {
      formError = 'URL is required';
      return;
    }
    try {
      await createBookmarkNode(targetParentFolderId, formTitle, formUrl);
      showAddModal = false;
      showNotification('Bookmark added!', 'success');
      await loadTrees();
      await reloadFolder();
    } catch (err) {
      formError = err instanceof Error ? err.message : 'Invalid URL';
    }
  }

  function openNewFolderModal(parentFolderId?: string) {
    targetParentFolderId = parentFolderId || currentFolderId;
    formTitle = '';
    formError = '';
    showFolderModal = true;
  }

  async function handleNewFolderSubmit() {
    if (!formTitle.trim()) {
      formError = 'Folder title is required';
      return;
    }
    try {
      await createFolderNode(targetParentFolderId, formTitle);
      showFolderModal = false;
      showNotification('Folder created!', 'success');
      expandedFolderIds.add(targetParentFolderId);
      expandedFolderIds = new Set(expandedFolderIds);
      await loadTrees();
      await reloadFolder();
    } catch (err) {
      formError = err instanceof Error ? err.message : 'Could not create folder';
    }
  }

  function openEditModal(item: BookmarkItem) {
    editingItem = item;
    formTitle = item.title;
    formUrl = item.url ?? '';
    formError = '';
    showEditModal = true;
  }

  async function handleEditSubmit() {
    if (!editingItem) return;
    try {
      const changes: { title?: string; url?: string } = {
        title: formTitle.trim(),
      };
      if (editingItem.url) {
        changes.url = formUrl.trim();
      }
      await updateBookmarkNode(editingItem.id, changes);
      showEditModal = false;
      showNotification('Item updated!', 'success');
      await loadTrees();
      await reloadFolder();
    } catch (err) {
      formError = err instanceof Error ? err.message : 'Could not update bookmark';
    }
  }

  function confirmDeleteItem(item: BookmarkItem) {
    deletingItem = item;
    showDeleteConfirmModal = true;
  }

  async function handleDeleteConfirmed() {
    if (!deletingItem) return;
    const isFolder = !deletingItem.url;
    try {
      await deleteBookmarkNode(deletingItem.id, isFolder);
      showDeleteConfirmModal = false;
      showNotification(`Deleted "${deletingItem.title}"`, 'success');
      await loadTrees();
      await reloadFolder();
    } catch (err) {
      showNotification('Failed to delete item', 'error');
    }
  }

  function formatDate(timestamp?: number): string {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
</script>

<div class="app-layout">
  <!-- Top Application Header -->
  <header class="manager-header">
    <div
      class="brand-section"
      onclick={() => initManager()}
      onkeydown={(e) => e.key === 'Enter' && initManager()}
      role="button"
      tabindex="0"
      title="Return to makTabs root folder"
    >
      <img src="/logo.svg" alt="MakTabs" class="brand-logo" width="28" height="28" />
      <h1 class="brand-name">MakTabs</h1>
      <span class="brand-badge">Bookmarks Manager</span>
    </div>

    <!-- Live Search -->
    <div class="search-container">
      <span class="search-icon">🔍</span>
      <input
        type="search"
        class="search-input"
        placeholder="Search bookmarks and folders by title or URL..."
        bind:value={searchQuery}
        oninput={handleSearchInput}
        aria-label="Search bookmarks"
      />
      {#if searchQuery}
        <button
          type="button"
          class="search-clear"
          onclick={clearSearch}
          title="Clear search"
          aria-label="Clear search"
        >
          ✕
        </button>
      {/if}
    </div>

    <!-- Header Quick Actions -->
    <div class="header-actions">
      <button
        type="button"
        class="btn {memorySaver ? 'btn-memory-saver active' : 'btn-secondary'}"
        onclick={toggleMemorySaver}
        title={memorySaver
          ? 'Memory Saver is active: tabs will be paused until focused to save RAM'
          : 'Memory Saver is off: tabs load immediately'}
      >
        <span>⚡ Memory Saver: {memorySaver ? 'ON' : 'OFF'}</span>
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => openNewFolderModal(currentFolderId)}
        disabled={isGlobalSearch}
        title="Create a new folder in current directory"
      >
        <span>📁+</span>
        <span>New Folder</span>
      </button>

      <button
        type="button"
        class="btn btn-primary"
        onclick={() => openAddBookmarkModal(currentFolderId)}
        disabled={isGlobalSearch}
        title="Add a new bookmark manually"
      >
        <span>🔖+</span>
        <span>Add Bookmark</span>
      </button>
    </div>
  </header>

  <!-- Notification Banner -->
  {#if notification}
    <div
      class="batch-bar"
      style={notification.type === 'error' ? 'background-color: var(--accent-danger-bg); color: var(--accent-danger); border-color: rgba(239, 68, 68, 0.3);' : ''}
      role="status"
    >
      <span>{notification.message}</span>
      <button
        type="button"
        class="search-clear"
        onclick={() => (notification = null)}
        style="position: static;"
      >
        ✕
      </button>
    </div>
  {/if}

  <!-- Selection / Batch Action Bar -->
  {#if selectedIds.size > 0}
    <div class="batch-bar" role="toolbar" aria-label="Batch operations">
      <div class="batch-info">
        <span>✓ {selectedIds.size} item(s) selected</span>
      </div>
      <div class="batch-actions">
        <button type="button" class="btn btn-secondary" onclick={openSelected}>
          Open Selected ({selectedIds.size})
        </button>
        <button type="button" class="btn btn-danger" onclick={deleteSelected}>
          Delete Selected ({selectedIds.size})
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => (selectedIds = new Set())}
        >
          Deselect All
        </button>
      </div>
    </div>
  {/if}

  <!-- Main View Area (Sidebar + Content) -->
  <div class="manager-main">
    <!-- Folder Tree Sidebar -->
    <aside class="manager-sidebar" aria-label="Bookmark Folders">
      <div class="sidebar-header">
        <span class="sidebar-title">Folders</span>
        <button
          type="button"
          class="btn-icon-only"
          onclick={loadTrees}
          title="Refresh folders"
          aria-label="Refresh folders"
        >
          🔄
        </button>
      </div>

      <nav class="sidebar-tree">
        {#each folderTree as rootFolder (rootFolder.id)}
          {@const rootItem: BookmarkItem = { id: rootFolder.id, title: rootFolder.title }}
          <div
            class="tree-node {currentFolderId === rootFolder.id ? 'active' : ''} {sidebarDragOverFolderId === rootFolder.id ? 'drop-target-folder' : ''}"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, rootItem)}
            ondragend={handleDragEnd}
            onclick={() => navigateToFolder(rootFolder.id, rootFolder.title)}
            onkeydown={(e) => e.key === 'Enter' && navigateToFolder(rootFolder.id, rootFolder.title)}
            ondragover={(e) => handleSidebarDragOver(e, rootFolder)}
            ondragleave={() => handleSidebarDragLeave(rootFolder)}
            ondrop={(e) => handleSidebarDrop(e, rootFolder)}
            role="button"
            tabindex="0"
            title="Folder: {rootFolder.title} (drag to move into another folder)"
          >
            <span class="tree-icon">{rootFolder.isMakTabsRoot ? '⚡' : '📁'}</span>
            <span class="tree-label">{rootFolder.title}</span>
            {#if rootFolder.childrenCount !== undefined && rootFolder.childrenCount > 0}
              <span class="tree-count">{rootFolder.childrenCount}</span>
            {/if}
          </div>

          <!-- Direct Subfolders in Sidebar -->
          {#if rootFolder.subfolders.length > 0}
            <div style="padding-left: 0.9rem; display: flex; flex-direction: column; gap: 0.15rem;">
              {#each rootFolder.subfolders as sub (sub.id)}
                {@const subItem: BookmarkItem = { id: sub.id, title: sub.title }}
                <div
                  class="tree-node {currentFolderId === sub.id ? 'active' : ''} {sidebarDragOverFolderId === sub.id ? 'drop-target-folder' : ''}"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, subItem)}
                  ondragend={handleDragEnd}
                  onclick={() => navigateToFolder(sub.id, sub.title)}
                  onkeydown={(e) => e.key === 'Enter' && navigateToFolder(sub.id, sub.title)}
                  ondragover={(e) => handleSidebarDragOver(e, sub)}
                  ondragleave={() => handleSidebarDragLeave(sub)}
                  ondrop={(e) => handleSidebarDrop(e, sub)}
                  role="button"
                  tabindex="0"
                  title="Folder: {sub.title} (drag to move into another folder)"
                >
                  <span class="tree-icon">📂</span>
                  <span class="tree-label">{sub.title}</span>
                  {#if sub.childrenCount !== undefined && sub.childrenCount > 0}
                    <span class="tree-count">{sub.childrenCount}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </nav>
    </aside>

    <!-- Main Content Panel -->
    <main class="manager-content">
      <!-- Toolbar & Breadcrumb Bar -->
      <div class="content-toolbar">
        <div class="breadcrumbs" aria-label="Breadcrumb">
          {#if viewMode === 'tree'}
            <span class="crumb-item current">Bookmarks Tree View</span>
            <button
              type="button"
              class="tree-expand-all-btn"
              onclick={expandAll}
              title="Expand all folders"
            >
              Expand All
            </button>
            <button
              type="button"
              class="tree-expand-all-btn"
              onclick={collapseAll}
              title="Collapse all folders"
            >
              Collapse All
            </button>
          {:else if isGlobalSearch}
            <span class="crumb-item current">Search Results for "{searchQuery}" ({displayedItems.length})</span>
          {:else}
            {#each breadcrumbs as crumb, idx (crumb.id)}
              {#if idx > 0}
                <span class="crumb-sep">›</span>
              {/if}
              {#if idx === breadcrumbs.length - 1}
                <span class="crumb-item current">{crumb.title}</span>
              {:else}
                <button
                  type="button"
                  class="crumb-item"
                  style="border: none; background: none; padding: 0; font: inherit;"
                  onclick={() => navigateToFolder(crumb.id, crumb.title)}
                >
                  {crumb.title}
                </button>
              {/if}
            {/each}
            <span style="color: var(--text-muted); font-size: 0.78rem; margin-left: 0.4rem;">
              ({bookmarkItemCount} tabs, {folderItemCount} folders)
            </span>
          {/if}
        </div>

        <div class="toolbar-controls">
          <!-- Restore Session Button (if in a MakTabs session folder) -->
          {#if isCurrentMakTabsSession && viewMode !== 'tree'}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => handleRestoreSession(currentFolderId, false)}
              title="Open all tabs from this session in current window and keep bookmarks"
            >
              <span>⚡ Restore (Keep)</span>
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onclick={() => handleRestoreSession(currentFolderId, true)}
              title="Open all tabs and remove this session folder (OneTab style)"
            >
              <span>⚡ Restore & Close</span>
            </button>
          {/if}

          <!-- Sort Select (for List and Grid views) -->
          {#if viewMode !== 'tree'}
            <select class="sort-select" bind:value={sortOption} aria-label="Sort order">
              <option value="manual">Manual Order (Drag & Drop)</option>
              <option value="name-asc">Name (A → Z)</option>
              <option value="name-desc">Name (Z → A)</option>
              <option value="date-desc">Date Added (Newest)</option>
              <option value="date-asc">Date Added (Oldest)</option>
            </select>
          {/if}

          <!-- View Mode Toggle: Tree, List, Grid -->
          <div class="view-toggle" role="group" aria-label="View layout mode">
            <button
              type="button"
              class="view-btn {viewMode === 'tree' ? 'active' : ''}"
              onclick={() => (viewMode = 'tree')}
              title="Hierarchical Tree view (drag folders & items)"
            >
              🌲 Tree
            </button>
            <button
              type="button"
              class="view-btn {viewMode === 'list' ? 'active' : ''}"
              onclick={() => (viewMode = 'list')}
              title="List view"
            >
              ☰ List
            </button>
            <button
              type="button"
              class="view-btn {viewMode === 'grid' ? 'active' : ''}"
              onclick={() => (viewMode = 'grid')}
              title="Grid view"
            >
              ⊞ Grid
            </button>
          </div>
        </div>
      </div>

      <!-- Items Scroll Container -->
      <div class="items-container">
        <!-- View 1: Tree View -->
        {#if viewMode === 'tree'}
          {#if displayedTree.length === 0}
            <div class="empty-state">
              <span class="empty-icon">🌲</span>
              <h2 class="empty-title">No bookmarks found</h2>
              <p class="empty-desc">Create your first folder or bookmark to get started.</p>
              <button type="button" class="btn btn-primary" onclick={() => openAddBookmarkModal()}>
                + Add Bookmark
              </button>
            </div>
          {:else}
            <div class="tree-root" role="tree" aria-label="Bookmarks Hierarchy">
              {#each displayedTree as rootNode (rootNode.id)}
                <BookmarkTreeNode
                  node={rootNode}
                  depth={0}
                  {expandedFolderIds}
                  {selectedIds}
                  {draggedItem}
                  {dragOverItemId}
                  {dropPosition}
                  onToggleExpand={toggleExpand}
                  onSelect={toggleSelect}
                  onOpenBookmark={handleOpenBookmark}
                  onOpenFolder={(id) => navigateToFolder(id)}
                  onEditItem={openEditModal}
                  onDeleteItem={confirmDeleteItem}
                  onAddBookmarkToFolder={(id) => openAddBookmarkModal(id)}
                  onAddSubfolderToFolder={(id) => openNewFolderModal(id)}
                  onRestoreFolder={(id, removeAfter) => handleRestoreSession(id, removeAfter)}
                  onCopyUrl={copyUrl}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleItemDragOver}
                  onDragLeave={handleItemDragLeave}
                  onDrop={handleItemDrop}
                />
              {/each}
            </div>
          {/if}

        <!-- View 2 & 3: List / Grid Views -->
        {:else if displayedItems.length === 0}
          <div class="empty-state">
            <span class="empty-icon">{isGlobalSearch ? '🔍' : '📂'}</span>
            <h2 class="empty-title">{isGlobalSearch ? 'No bookmarks match your search' : 'This folder is empty'}</h2>
            <p class="empty-desc">
              {isGlobalSearch
                ? 'Try searching with different keywords or check spelling.'
                : 'Stash tabs using MakTabs popup, click Add Bookmark above, or drag bookmarks from other folders here.'}
            </p>
            {#if !isGlobalSearch}
              <button type="button" class="btn btn-primary" onclick={() => openAddBookmarkModal()}>
                + Add your first bookmark
              </button>
            {/if}
          </div>
        {:else}
          <div class={viewMode === 'list' ? 'items-list' : 'items-grid'}>
            {#each displayedItems as item, idx (item.id)}
              {@const isFolder = !item.url}
              {@const domain = item.url ? extractDomain(item.url) : ''}
              {@const badgeColor = item.url ? getDomainColor(domain) : ''}
              {@const initial = item.url ? getDomainInitial(domain) : ''}
              {@const isSelected = selectedIds.has(item.id)}
              {@const isDraggingThis = draggedItem?.id === item.id}
              {@const isDragOver = dragOverItemId === item.id}

              <div
                class="item-card {isSelected ? 'selected' : ''} {isDraggingThis ? 'dragging' : ''} {isDragOver && dropPosition === 'before' ? 'drop-before' : ''} {isDragOver && dropPosition === 'after' ? 'drop-after' : ''} {isDragOver && dropPosition === 'folder' ? 'drop-folder' : ''}"
                draggable={sortOption === 'manual'}
                ondragstart={(e) => handleDragStart(e, item)}
                ondragend={handleDragEnd}
                ondragover={(e) => handleItemDragOver(e, item)}
                ondragleave={() => handleItemDragLeave(item)}
                ondrop={(e) => handleItemDrop(e, item)}
                role="listitem"
              >
                <!-- Drag Grip (Manual sort mode) -->
                {#if sortOption === 'manual'}
                  <div class="drag-handle" title="Drag to reorder or move folder/item">
                    ⋮⋮
                  </div>
                {/if}

                <!-- Item Checkbox -->
                <input
                  type="checkbox"
                  class="item-checkbox"
                  checked={isSelected}
                  onchange={() => toggleSelect(item.id)}
                  aria-label="Select item"
                />

                <!-- Monogram / Icon Badge -->
                {#if isFolder}
                  <div
                    class="item-badge folder-badge"
                    onclick={() => navigateToFolder(item.id, item.title)}
                    onkeydown={(e) => e.key === 'Enter' && navigateToFolder(item.id, item.title)}
                    role="button"
                    tabindex="0"
                    title="Open folder"
                  >
                    📁
                  </div>
                {:else}
                  <div
                    class="item-badge"
                    style="background-color: {badgeColor};"
                    title={domain}
                  >
                    {initial}
                  </div>
                {/if}

                <!-- Title & Metadata -->
                <div class="item-info">
                  <div class="item-title-row">
                    {#if isFolder}
                      <button
                        type="button"
                        class="item-title"
                        style="border: none; background: none; padding: 0; text-align: left;"
                        onclick={() => navigateToFolder(item.id, item.title)}
                      >
                        {item.title}
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="item-title"
                        style="border: none; background: none; padding: 0; text-align: left;"
                        onclick={() => handleOpenBookmark(item)}
                        title="Open in new tab: {item.url}"
                      >
                        {item.title}
                      </button>
                    {/if}
                  </div>

                  <div class="item-meta">
                    {#if isFolder}
                      <span>{item.childrenCount ?? 0} item(s)</span>
                    {:else}
                      <span class="item-domain" title={item.url}>{domain || item.url}</span>
                    {/if}
                    {#if item.dateAdded}
                      <span class="item-date">• {formatDate(item.dateAdded)}</span>
                    {/if}
                  </div>
                </div>

                <!-- Hover Actions -->
                <div class="item-actions">
                  {#if isFolder}
                    <button
                      type="button"
                      class="action-btn"
                      onclick={() => handleOpenAllInFolder(item.id, false)}
                      title="Open all bookmarks in folder"
                    >
                      ↗ All
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="action-btn"
                      onclick={() => handleOpenBookmark(item)}
                      title="Open in new tab"
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      class="action-btn"
                      onclick={() => copyUrl(item.url)}
                      title="Copy URL"
                    >
                      📋
                    </button>
                  {/if}

                  <!-- Manual Move Buttons (Accessibility fallback for DND) -->
                  {#if sortOption === 'manual'}
                    <button
                      type="button"
                      class="action-btn"
                      onclick={() => moveItemOrder(item, 'up')}
                      disabled={idx === 0}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      class="action-btn"
                      onclick={() => moveItemOrder(item, 'down')}
                      disabled={idx === displayedItems.length - 1}
                      title="Move down"
                    >
                      ▼
                    </button>
                  {/if}

                  <button
                    type="button"
                    class="action-btn"
                    onclick={() => openEditModal(item)}
                    title="Edit title and URL"
                  >
                    ✏️
                  </button>

                  <button
                    type="button"
                    class="action-btn delete-btn"
                    onclick={() => confirmDeleteItem(item)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </main>
  </div>

  <!-- Modal: Add Bookmark -->
  {#if showAddModal}
    <div class="modal-backdrop" onclick={() => (showAddModal = false)} role="presentation">
      <div
        class="modal-dialog"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (showAddModal = false)}
        role="dialog"
        tabindex="-1"
      >
        <div class="modal-header">
          <h3 class="modal-title">Add Bookmark</h3>
          <button type="button" class="search-clear" onclick={() => (showAddModal = false)}>✕</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); handleAddBookmarkSubmit(); }}>
          <div class="modal-body">
            {#if formError}
              <div style="color: var(--accent-danger); font-size: 0.8rem;">{formError}</div>
            {/if}
            <div class="form-group">
              <label class="form-label" for="add-bm-title">Title</label>
              <input
                id="add-bm-title"
                type="text"
                class="form-input"
                bind:value={formTitle}
                placeholder="Page Title"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="add-bm-url">URL</label>
              <input
                id="add-bm-url"
                type="url"
                class="form-input"
                bind:value={formUrl}
                placeholder="https://example.com"
                required
              />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick={() => (showAddModal = false)}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              Add Bookmark
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Modal: New Folder -->
  {#if showFolderModal}
    <div class="modal-backdrop" onclick={() => (showFolderModal = false)} role="presentation">
      <div
        class="modal-dialog"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (showFolderModal = false)}
        role="dialog"
        tabindex="-1"
      >
        <div class="modal-header">
          <h3 class="modal-title">New Folder</h3>
          <button type="button" class="search-clear" onclick={() => (showFolderModal = false)}>✕</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); handleNewFolderSubmit(); }}>
          <div class="modal-body">
            {#if formError}
              <div style="color: var(--accent-danger); font-size: 0.8rem;">{formError}</div>
            {/if}
            <div class="form-group">
              <label class="form-label" for="new-folder-title">Folder Name</label>
              <input
                id="new-folder-title"
                type="text"
                class="form-input"
                bind:value={formTitle}
                placeholder="Folder Name"
                required
              />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick={() => (showFolderModal = false)}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Modal: Edit Item -->
  {#if showEditModal && editingItem}
    <div class="modal-backdrop" onclick={() => (showEditModal = false)} role="presentation">
      <div
        class="modal-dialog"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (showEditModal = false)}
        role="dialog"
        tabindex="-1"
      >
        <div class="modal-header">
          <h3 class="modal-title">Edit {editingItem.url ? 'Bookmark' : 'Folder'}</h3>
          <button type="button" class="search-clear" onclick={() => (showEditModal = false)}>✕</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); handleEditSubmit(); }}>
          <div class="modal-body">
            {#if formError}
              <div style="color: var(--accent-danger); font-size: 0.8rem;">{formError}</div>
            {/if}
            <div class="form-group">
              <label class="form-label" for="edit-title">Title</label>
              <input
                id="edit-title"
                type="text"
                class="form-input"
                bind:value={formTitle}
                required
              />
            </div>
            {#if editingItem.url}
              <div class="form-group">
                <label class="form-label" for="edit-url">URL</label>
                <input
                  id="edit-url"
                  type="url"
                  class="form-input"
                  bind:value={formUrl}
                  required
                />
              </div>
            {/if}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Modal: Delete Confirmation -->
  {#if showDeleteConfirmModal && deletingItem}
    <div class="modal-backdrop" onclick={() => (showDeleteConfirmModal = false)} role="presentation">
      <div
        class="modal-dialog"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (showDeleteConfirmModal = false)}
        role="dialog"
        tabindex="-1"
      >
        <div class="modal-header">
          <h3 class="modal-title">Delete {deletingItem.url ? 'Bookmark' : 'Folder'}?</h3>
          <button type="button" class="search-clear" onclick={() => (showDeleteConfirmModal = false)}>✕</button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
            Are you sure you want to delete <strong>"{deletingItem.title}"</strong>?
            {#if !deletingItem.url}
              <br /><br />
              <span style="color: var(--accent-danger);">
                ⚠️ Warning: Deleting this folder will permanently delete all bookmarks and subfolders inside it!
              </span>
            {/if}
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick={() => (showDeleteConfirmModal = false)}>
            Cancel
          </button>
          <button type="button" class="btn btn-danger" onclick={handleDeleteConfirmed}>
            Delete
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .app-layout {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tree-root {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .tree-expand-all-btn {
    border: 1px solid var(--border-color);
    background-color: var(--bg-surface-hover);
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.18rem 0.45rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    margin-left: 0.35rem;
  }

  .tree-expand-all-btn:hover {
    background-color: var(--bg-surface-active);
    color: var(--text-main);
  }
</style>
