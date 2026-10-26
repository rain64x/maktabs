<script lang="ts">
  import BookmarkTreeNode from './BookmarkTreeNode.svelte';
  import {
    extractDomain,
    getDomainInitial,
    getDomainColor,
    type BookmarkItem,
  } from '@/lib/bookmarks';

  let {
    node,
    depth = 0,
    expandedFolderIds,
    selectedIds,
    draggedItem,
    dragOverItemId,
    dropPosition,
    onToggleExpand,
    onSelect,
    onOpenBookmark,
    onOpenFolder,
    onEditItem,
    onDeleteItem,
    onAddBookmarkToFolder,
    onAddSubfolderToFolder,
    onRestoreFolder,
    onCopyUrl,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  }: {
    node: BookmarkItem;
    depth?: number;
    expandedFolderIds: Set<string>;
    selectedIds: Set<string>;
    draggedItem: BookmarkItem | null;
    dragOverItemId: string | null;
    dropPosition: 'before' | 'after' | 'folder' | null;
    onToggleExpand: (id: string) => void;
    onSelect: (id: string) => void;
    onOpenBookmark: (item: BookmarkItem) => void;
    onOpenFolder: (folderId: string) => void;
    onEditItem: (item: BookmarkItem) => void;
    onDeleteItem: (item: BookmarkItem) => void;
    onAddBookmarkToFolder: (folderId: string) => void;
    onAddSubfolderToFolder: (folderId: string) => void;
    onRestoreFolder: (folderId: string, removeAfter: boolean) => void;
    onCopyUrl: (url?: string) => void;
    onDragStart: (e: DragEvent, item: BookmarkItem) => void;
    onDragEnd: () => void;
    onDragOver: (e: DragEvent, item: BookmarkItem) => void;
    onDragLeave: (item: BookmarkItem) => void;
    onDrop: (e: DragEvent, item: BookmarkItem) => void;
  } = $props();

  let isFolder = $derived(!node.url);
  let isExpanded = $derived(expandedFolderIds.has(node.id));
  let isSelected = $derived(selectedIds.has(node.id));
  let isDraggingThis = $derived(draggedItem?.id === node.id);
  let isDragOver = $derived(dragOverItemId === node.id);

  let domain = $derived(node.url ? extractDomain(node.url) : '');
  let badgeColor = $derived(node.url ? getDomainColor(domain) : '');
  let initial = $derived(node.url ? getDomainInitial(domain) : '');
  let isMakTabsRoot = $derived(isFolder && node.title.toLowerCase() === 'maktabs');

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

<div class="tree-item-wrapper" style="--depth: {depth}">
  <!-- Node Card / Row -->
  <div
    class="tree-node-row {isFolder ? 'is-folder' : 'is-bookmark'} {isSelected ? 'selected' : ''} {isDraggingThis ? 'dragging' : ''} {isDragOver && dropPosition === 'before' ? 'drop-before' : ''} {isDragOver && dropPosition === 'after' ? 'drop-after' : ''} {isDragOver && dropPosition === 'folder' ? 'drop-folder' : ''}"
    style="padding-left: calc(0.85rem + var(--depth) * 1.5rem);"
    draggable="true"
    ondragstart={(e) => onDragStart(e, node)}
    ondragend={onDragEnd}
    ondragover={(e) => onDragOver(e, node)}
    ondragleave={() => onDragLeave(node)}
    ondrop={(e) => onDrop(e, node)}
    role="treeitem"
    tabindex="0"
    aria-selected={isSelected}
    aria-expanded={isFolder ? isExpanded : undefined}
  >
    <!-- Drag Handle -->
    <span class="tree-drag-handle" title="Drag to reorder or move folder/item">
      ⋮⋮
    </span>

    <!-- Expand/Collapse Chevron (for folders) -->
    {#if isFolder}
      <button
        type="button"
        class="tree-chevron-btn {isExpanded ? 'expanded' : ''}"
        onclick={() => onToggleExpand(node.id)}
        title={isExpanded ? 'Collapse folder' : 'Expand folder'}
        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
      >
        ▶
      </button>
    {:else}
      <span class="tree-chevron-spacer"></span>
    {/if}

    <!-- Selection Checkbox -->
    <input
      type="checkbox"
      class="item-checkbox"
      checked={isSelected}
      onchange={() => onSelect(node.id)}
      aria-label="Select item"
    />

    <!-- Icon / Badge -->
    {#if isFolder}
      <div
        class="tree-badge folder-badge {isMakTabsRoot ? 'maktabs-badge' : ''}"
        onclick={() => onToggleExpand(node.id)}
        onkeydown={(e) => e.key === 'Enter' && onToggleExpand(node.id)}
        role="button"
        tabindex="0"
        title="Toggle folder"
      >
        {isMakTabsRoot ? '⚡' : isExpanded ? '📂' : '📁'}
      </div>
    {:else}
      <div
        class="tree-badge"
        style="background-color: {badgeColor};"
        title={domain}
      >
        {initial}
      </div>
    {/if}

    <!-- Title and Metadata -->
    <div class="tree-info">
      <div class="tree-title-line">
        {#if isFolder}
          <button
            type="button"
            class="tree-title-btn"
            onclick={() => onToggleExpand(node.id)}
            title="Click to toggle: {node.title}"
          >
            {node.title}
          </button>
        {:else}
          <button
            type="button"
            class="tree-title-btn bookmark-link"
            onclick={() => onOpenBookmark(node)}
            title="Open: {node.url}"
          >
            {node.title}
          </button>
        {/if}
      </div>

      <div class="tree-meta">
        {#if isFolder}
          <span class="tree-count-badge">
            {node.childrenCount ?? (node.children ? node.children.length : 0)} items
          </span>
        {:else}
          <span class="tree-domain" title={node.url}>{domain || node.url}</span>
        {/if}
        {#if node.dateAdded}
          <span class="tree-date">• {formatDate(node.dateAdded)}</span>
        {/if}
      </div>
    </div>

    <!-- Actions Toolbar on Hover/Focus -->
    <div class="tree-actions">
      {#if isFolder}
        <!-- Restore buttons if MakTabs session -->
        <button
          type="button"
          class="tree-action-btn"
          onclick={() => onRestoreFolder(node.id, false)}
          title="Open all tabs in folder"
        >
          ⚡ Open All
        </button>

        <button
          type="button"
          class="tree-action-btn"
          onclick={() => onAddBookmarkToFolder(node.id)}
          title="Add bookmark into this folder"
        >
          🔖+
        </button>

        <button
          type="button"
          class="tree-action-btn"
          onclick={() => onAddSubfolderToFolder(node.id)}
          title="Add subfolder into this folder"
        >
          📁+
        </button>
      {:else}
        <button
          type="button"
          class="tree-action-btn"
          onclick={() => onOpenBookmark(node)}
          title="Open in new tab"
        >
          ↗
        </button>
        <button
          type="button"
          class="tree-action-btn"
          onclick={() => onCopyUrl(node.url)}
          title="Copy URL"
        >
          📋
        </button>
      {/if}

      <button
        type="button"
        class="tree-action-btn"
        onclick={() => onEditItem(node)}
        title="Edit"
      >
        ✏️
      </button>

      <button
        type="button"
        class="tree-action-btn tree-btn-danger"
        onclick={() => onDeleteItem(node)}
        title="Delete"
      >
        🗑️
      </button>
    </div>
  </div>

  <!-- Recursive Children Subtree -->
  {#if isFolder && isExpanded}
    <div class="tree-children-container" role="group">
      {#if node.children && node.children.length > 0}
        {#each node.children as child (child.id)}
          <BookmarkTreeNode
            node={child}
            depth={depth + 1}
            {expandedFolderIds}
            {selectedIds}
            {draggedItem}
            {dragOverItemId}
            {dropPosition}
            {onToggleExpand}
            {onSelect}
            {onOpenBookmark}
            {onOpenFolder}
            {onEditItem}
            {onDeleteItem}
            {onAddBookmarkToFolder}
            {onAddSubfolderToFolder}
            {onRestoreFolder}
            {onCopyUrl}
            {onDragStart}
            {onDragEnd}
            {onDragOver}
            {onDragLeave}
            {onDrop}
          />
        {/each}
      {:else}
        <div
          class="tree-empty-folder"
          style="padding-left: calc(2.4rem + (var(--depth) + 1) * 1.5rem);"
          role="region"
          aria-label="Empty folder drop zone"
          ondragover={(e) => onDragOver(e, node)}
          ondragleave={() => onDragLeave(node)}
          ondrop={(e) => onDrop(e, node)}
        >
          <span class="tree-empty-text">Empty folder — drop folders or bookmarks here</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tree-item-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .tree-node-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding-top: 0.45rem;
    padding-bottom: 0.45rem;
    padding-right: 1rem;
    border-radius: var(--radius-sm);
    background-color: var(--bg-surface);
    border: 1px solid var(--border-color);
    margin-bottom: 3px;
    transition: all 0.12s ease;
    user-select: none;
    position: relative;
  }

  .tree-node-row:hover {
    background-color: var(--bg-surface-hover);
    border-color: var(--border-subtle);
  }

  .tree-node-row.is-folder {
    font-weight: 500;
  }

  .tree-node-row.selected {
    background-color: var(--primary-subtle);
    border-color: var(--primary-border);
  }

  .tree-node-row.dragging {
    opacity: 0.35;
    transform: scale(0.99);
  }

  .tree-node-row.drop-before {
    border-top: 3px solid var(--primary) !important;
  }

  .tree-node-row.drop-after {
    border-bottom: 3px solid var(--primary) !important;
  }

  .tree-node-row.drop-folder {
    outline: 2px dashed var(--primary);
    background-color: var(--primary-subtle);
  }

  .tree-drag-handle {
    cursor: grab;
    color: var(--text-subtle);
    font-size: 0.78rem;
    padding: 0.2rem 0.1rem;
    display: flex;
    align-items: center;
  }

  .tree-drag-handle:hover {
    color: var(--text-main);
  }

  .tree-chevron-btn {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.65rem;
    color: var(--text-muted);
    border-radius: 3px;
    transition: transform 0.15s ease;
  }

  .tree-chevron-btn:hover {
    background-color: rgba(128, 128, 128, 0.15);
    color: var(--text-main);
  }

  .tree-chevron-btn.expanded {
    transform: rotate(90deg);
  }

  .tree-chevron-spacer {
    width: 18px;
  }

  .tree-badge {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.7rem;
    color: #ffffff;
    flex-shrink: 0;
  }

  .folder-badge {
    background-color: var(--accent-amber-bg);
    color: var(--accent-amber);
    border: 1px solid rgba(245, 158, 11, 0.25);
    font-size: 0.95rem;
    cursor: pointer;
  }

  .maktabs-badge {
    background-color: var(--primary-subtle);
    color: var(--primary);
    border-color: var(--primary-border);
  }

  .tree-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .tree-title-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .tree-title-btn {
    border: none;
    background: transparent;
    padding: 0;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-main);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .tree-title-btn:hover {
    color: var(--primary);
  }

  .tree-title-btn.bookmark-link {
    font-weight: 500;
  }

  .tree-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .tree-count-badge {
    background-color: rgba(128, 128, 128, 0.1);
    padding: 0.08rem 0.4rem;
    border-radius: 9999px;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .tree-domain {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-date {
    color: var(--text-subtle);
  }

  .tree-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    opacity: 0.35;
    transition: opacity 0.15s ease;
  }

  .tree-node-row:hover .tree-actions,
  .tree-node-row:focus-within .tree-actions {
    opacity: 1;
  }

  .tree-action-btn {
    padding: 0.25rem 0.4rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 0.74rem;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    transition: all 0.12s ease;
  }

  .tree-action-btn:hover {
    background-color: var(--bg-surface-active);
    color: var(--text-main);
    border-color: var(--border-color);
  }

  .tree-action-btn.tree-btn-danger:hover {
    background-color: var(--accent-danger-bg);
    color: var(--accent-danger);
    border-color: rgba(239, 68, 68, 0.25);
  }

  .tree-children-container {
    display: flex;
    flex-direction: column;
  }

  .tree-empty-folder {
    padding-top: 0.35rem;
    padding-bottom: 0.35rem;
    margin-bottom: 3px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--border-color);
    background-color: rgba(128, 128, 128, 0.03);
  }

  .tree-empty-text {
    font-size: 0.72rem;
    color: var(--text-subtle);
    font-style: italic;
  }
</style>
