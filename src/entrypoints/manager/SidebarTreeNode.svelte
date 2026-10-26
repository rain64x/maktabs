<script lang="ts">
  import SidebarTreeNode from './SidebarTreeNode.svelte';
  import type { FolderNode, BookmarkItem } from '@/lib/bookmarks';

  let {
    node,
    depth = 0,
    currentFolderId,
    expandedFolderIds,
    sidebarDragOverFolderId,
    onSelectFolder,
    onToggleExpand,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  }: {
    node: FolderNode;
    depth?: number;
    currentFolderId: string;
    expandedFolderIds: Set<string>;
    sidebarDragOverFolderId: string | null;
    onSelectFolder: (id: string, title: string) => void;
    onToggleExpand: (id: string) => void;
    onDragStart: (e: DragEvent, item: BookmarkItem) => void;
    onDragEnd: () => void;
    onDragOver: (e: DragEvent, folder: FolderNode) => void;
    onDragLeave: (folder: FolderNode) => void;
    onDrop: (e: DragEvent, folder: FolderNode) => void;
  } = $props();

  let hasSubfolders = $derived(Boolean(node.subfolders && node.subfolders.length > 0));
  let isExpanded = $derived(expandedFolderIds.has(node.id));
  let isActive = $derived(currentFolderId === node.id);
  let isDragOver = $derived(sidebarDragOverFolderId === node.id);
  let itemBookmark = $derived<BookmarkItem>({ id: node.id, title: node.title });

  function handleRowClick() {
    onSelectFolder(node.id, node.title);
    // If it has subfolders and isn't expanded yet, expand it so the user sees the nested tree
    if (hasSubfolders && !isExpanded) {
      onToggleExpand(node.id);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick();
    } else if (e.key === 'ArrowRight' && hasSubfolders && !isExpanded) {
      e.preventDefault();
      onToggleExpand(node.id);
    } else if (e.key === 'ArrowLeft' && hasSubfolders && isExpanded) {
      e.preventDefault();
      onToggleExpand(node.id);
    }
  }
</script>

<div class="sidebar-tree-item" role="none">
  <div
    class="tree-node {isActive ? 'active' : ''} {isDragOver ? 'drop-target-folder' : ''}"
    style="padding-left: calc(0.4rem + {depth * 0.9}rem);"
    draggable="true"
    ondragstart={(e) => onDragStart(e, itemBookmark)}
    ondragend={onDragEnd}
    onclick={handleRowClick}
    onkeydown={handleKeyDown}
    ondragover={(e) => onDragOver(e, node)}
    ondragleave={() => onDragLeave(node)}
    ondrop={(e) => onDrop(e, node)}
    role="treeitem"
    tabindex="0"
    aria-expanded={hasSubfolders ? isExpanded : undefined}
    aria-selected={isActive}
    title="{node.title} ({node.childrenCount ?? 0} items) — Click to view in main pane, drag to reorder"
  >
    <!-- Expand/Collapse Chevron -->
    {#if hasSubfolders}
      <button
        type="button"
        class="tree-chevron-btn {isExpanded ? 'expanded' : ''}"
        onclick={(e) => {
          e.stopPropagation();
          onToggleExpand(node.id);
        }}
        title={isExpanded ? 'Collapse subfolders' : 'Expand subfolders'}
        aria-label={isExpanded ? 'Collapse subfolders' : 'Expand subfolders'}
      >
        ▶
      </button>
    {:else}
      <span class="tree-chevron-spacer"></span>
    {/if}

    <!-- Folder Icon -->
    <span class="tree-icon">
      {#if node.isMakTabsRoot}
        ⚡
      {:else if isExpanded}
        📂
      {:else}
        📁
      {/if}
    </span>

    <!-- Folder Name -->
    <span class="tree-label">{node.title}</span>

    <!-- Child Count Badge -->
    {#if node.childrenCount !== undefined && node.childrenCount > 0}
      <span class="tree-count" title="{node.childrenCount} item(s)">
        {node.childrenCount}
      </span>
    {/if}
  </div>

  <!-- Recursive Child Subfolders -->
  {#if hasSubfolders && isExpanded}
    <div class="sidebar-subtree" role="group">
      {#each node.subfolders as subfolder (subfolder.id)}
        <SidebarTreeNode
          node={subfolder}
          depth={depth + 1}
          {currentFolderId}
          {expandedFolderIds}
          {sidebarDragOverFolderId}
          {onSelectFolder}
          {onToggleExpand}
          {onDragStart}
          {onDragEnd}
          {onDragOver}
          {onDragLeave}
          {onDrop}
        />
      {/each}
    </div>
  {/if}
</div>
