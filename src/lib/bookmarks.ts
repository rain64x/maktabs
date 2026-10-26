import { browser } from 'wxt/browser';

export const MAKTABS_FOLDER_NAME = 'makTabs';

export const ALLOWED_SCHEMES = ['http:', 'https:', 'file:', 'ftp:'] as const;

/**
 * Validates whether a tab URL is supported by native browser bookmarks.
 * Excludes internal schemes like chrome://, about:, edge://, etc.
 */
export function isStashableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_SCHEMES.includes(parsed.protocol as (typeof ALLOWED_SCHEMES)[number]);
  } catch {
    return false;
  }
}

/**
 * Finds or creates the root 'makTabs' bookmark folder.
 * Resolves across Chromium ("Other Bookmarks") and Gecko ("unfiled_____").
 */
export async function getOrCreateMakTabsFolder(): Promise<string> {
  const matches = await browser.bookmarks.search({ title: MAKTABS_FOLDER_NAME });
  const existingFolder = matches.find((item) => !item.url);
  if (existingFolder?.id) {
    return existingFolder.id;
  }

  let parentId: string | undefined;
  try {
    const tree = await browser.bookmarks.getTree();
    const rootChildren = tree[0]?.children ?? [];

    const otherBookmarks = rootChildren.find((node) => {
      const title = (node.title || '').toLowerCase();
      return (
        node.id === '2' ||
        node.id === 'unfiled_____' ||
        title.includes('other') ||
        title.includes('unfiled')
      );
    });

    const firstChild = rootChildren[0];
    if (otherBookmarks?.id) {
      parentId = otherBookmarks.id;
    } else if (firstChild?.id) {
      parentId = firstChild.id;
    }
  } catch (err) {
    console.warn('Could not inspect bookmark tree for parent folder:', err);
  }

  const created = await browser.bookmarks.create({
    parentId,
    title: MAKTABS_FOLDER_NAME,
  });

  return created.id;
}

export interface StashResult {
  success: boolean;
  count: number;
  message: string;
}

export interface BookmarkItem {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  childrenCount?: number;
  children?: BookmarkItem[];
}

export interface FolderNode {
  id: string;
  title: string;
  parentId?: string;
  childrenCount?: number;
  subfolders: FolderNode[];
  isMakTabsRoot?: boolean;
}

/**
 * Stashes the active tab in the current window into the 'makTabs' folder.
 */
export async function stashCurrentTab(closeAfter = false): Promise<StashResult> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.url) {
      return { success: false, count: 0, message: 'No active tab found' };
    }

    if (activeTab.pinned) {
      return {
        success: false,
        count: 0,
        message: 'Pinned tabs are protected from stashing',
      };
    }

    if (!isStashableUrl(activeTab.url)) {
      return {
        success: false,
        count: 0,
        message: 'Cannot stash internal browser page',
      };
    }

    const folderId = await getOrCreateMakTabsFolder();
    await browser.bookmarks.create({
      parentId: folderId,
      title: activeTab.title || activeTab.url,
      url: activeTab.url,
      index: 0,
    });

    if (closeAfter && activeTab.id !== undefined) {
      await browser.tabs.remove(activeTab.id);
    }

    return {
      success: true,
      count: 1,
      message: closeAfter
        ? 'Saved and closed this tab'
        : 'Saved this tab to makTabs',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      count: 0,
      message: `Failed to save tab: ${errorMsg}`,
    };
  }
}

/**
 * Stashes all eligible tabs in the current window into a timestamped subfolder inside 'makTabs'.
 */
export async function stashAllTabs(closeAfter = false): Promise<StashResult> {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });
    const validTabs = tabs.filter((t) => !t.pinned && isStashableUrl(t.url));

    if (validTabs.length === 0) {
      return {
        success: false,
        count: 0,
        message: 'No eligible unpinned tabs found to stash in this window',
      };
    }

    const rootFolderId = await getOrCreateMakTabsFolder();

    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const sessionTitle = `${dateStr}, ${timeStr} (${validTabs.length} tabs)`;

    const sessionFolder = await browser.bookmarks.create({
      parentId: rootFolderId,
      title: sessionTitle,
      index: 0,
    });

    let savedCount = 0;
    const tabIdsToClose: number[] = [];

    for (const tab of validTabs) {
      if (tab.url) {
        try {
          await browser.bookmarks.create({
            parentId: sessionFolder.id,
            title: tab.title || tab.url,
            url: tab.url,
          });
          savedCount++;
          if (tab.id !== undefined) {
            tabIdsToClose.push(tab.id);
          }
        } catch (itemErr) {
          console.warn(`Skipped tab "${tab.title}":`, itemErr);
        }
      }
    }

    if (closeAfter && tabIdsToClose.length > 0) {
      try {
        const currentWin = await browser.windows.getCurrent();
        if (tabIdsToClose.length >= tabs.length && currentWin.id !== undefined) {
          await browser.windows.remove(currentWin.id);
        } else {
          await browser.tabs.remove(tabIdsToClose);
        }
      } catch {
        await browser.tabs.remove(tabIdsToClose);
      }
    }

    return {
      success: savedCount > 0,
      count: savedCount,
      message: closeAfter
        ? `Saved and closed ${savedCount} tabs from this window`
        : `Saved ${savedCount} tabs from this window to makTabs / ${sessionTitle}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      count: 0,
      message: `Failed to stash tabs: ${errorMsg}`,
    };
  }
}

export interface StashableTabsInfo {
  totalValid: number;
  isCurrentValid: boolean;
  isCurrentPinned: boolean;
}

/**
 * Retrieves tab counts for current window, ignoring pinned tabs.
 */
export async function getStashableTabsInfo(): Promise<StashableTabsInfo> {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });
    const activeTab = tabs.find((t) => t.active);
    const totalValid = tabs.filter((t) => !t.pinned && isStashableUrl(t.url)).length;
    const isCurrentPinned = Boolean(activeTab?.pinned);
    const isCurrentValid = activeTab
      ? !activeTab.pinned && isStashableUrl(activeTab.url)
      : false;
    return { totalValid, isCurrentValid, isCurrentPinned };
  } catch {
    return { totalValid: 0, isCurrentValid: false, isCurrentPinned: false };
  }
}

/**
 * Returns all bookmark folders in a structured tree for sidebar navigation.
 */
export async function getAllFoldersTree(): Promise<FolderNode[]> {
  try {
    const tree = await browser.bookmarks.getTree();
    const rootNodes = tree[0]?.children ?? [];

    function mapNode(node: typeof rootNodes[number]): FolderNode | null {
      if (node.url) return null;

      const subfolders: FolderNode[] = [];
      let totalChildren = 0;

      if (node.children) {
        totalChildren = node.children.length;
        for (const child of node.children) {
          const sub = mapNode(child);
          if (sub) {
            subfolders.push(sub);
          }
        }
      }

      return {
        id: node.id,
        title: node.title || (node.id === '0' || node.id === 'root________' ? 'Root' : 'Folder'),
        parentId: node.parentId,
        childrenCount: totalChildren,
        subfolders,
        isMakTabsRoot: node.title === MAKTABS_FOLDER_NAME,
      };
    }

    const folders: FolderNode[] = [];
    for (const root of rootNodes) {
      const f = mapNode(root);
      if (f) folders.push(f);
    }
    return folders;
  } catch (err) {
    console.warn('Failed to load bookmark folder tree:', err);
    return [];
  }
}

/**
 * Returns the entire hierarchical bookmark tree (folders and bookmarks).
 */
export async function getFullBookmarkTree(): Promise<BookmarkItem[]> {
  try {
    const tree = await browser.bookmarks.getTree();
    const rootNodes = tree[0]?.children ?? [];

    function mapNode(node: typeof rootNodes[number]): BookmarkItem {
      const isFolder = !node.url;
      const subChildren = isFolder && node.children ? node.children.map(mapNode) : undefined;
      return {
        id: node.id,
        parentId: node.parentId,
        index: node.index,
        url: node.url,
        title: node.title || (node.url ? node.url : (node.id === '0' || node.id === 'root________' ? 'Root' : 'Untitled Folder')),
        dateAdded: node.dateAdded,
        dateGroupModified: node.dateGroupModified,
        childrenCount: isFolder && node.children ? node.children.length : undefined,
        children: subChildren,
      };
    }

    return rootNodes.map(mapNode);
  } catch (err) {
    console.warn('Failed to load full bookmark tree:', err);
    return [];
  }
}

/**
 * Checks whether targetId is draggedId itself or a descendant of draggedId,
 * preventing circular tree parenting errors when moving folders.
 */
export function isDescendant(draggedId: string, targetId: string, allNodes: BookmarkItem[]): boolean {
  if (draggedId === targetId) return true;

  function findNode(nodes: BookmarkItem[], id: string): BookmarkItem | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  const draggedNode = findNode(allNodes, draggedId);
  if (!draggedNode || !draggedNode.children) return false;

  function hasChild(nodes: BookmarkItem[]): boolean {
    for (const child of nodes) {
      if (child.id === targetId) return true;
      if (child.children && hasChild(child.children)) return true;
    }
    return false;
  }

  return hasChild(draggedNode.children);
}

/**
 * Fetches direct children of a bookmark folder with subfolder child counts.
 */
export async function getFolderContents(folderId: string): Promise<BookmarkItem[]> {
  try {
    const subTree = await browser.bookmarks.getSubTree(folderId);
    const root = subTree[0];
    if (!root || !root.children) return [];

    return root.children.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      index: node.index,
      url: node.url,
      title: node.title || (node.url ? node.url : 'Untitled Folder'),
      dateAdded: node.dateAdded,
      dateGroupModified: node.dateGroupModified,
      childrenCount: node.children ? node.children.length : undefined,
    }));
  } catch (err) {
    console.warn(`Failed to get contents for folder ${folderId}:`, err);
    return [];
  }
}

/**
 * Moves a bookmark or folder to a target parent or index.
 */
export async function moveBookmarkItem(
  id: string,
  destination: { parentId?: string; index?: number }
): Promise<void> {
  await browser.bookmarks.move(id, destination);
}

/**
 * Creates a new bookmark inside a parent folder.
 */
export async function createBookmarkNode(
  parentId: string,
  title: string,
  url: string,
  index?: number
): Promise<BookmarkItem> {
  const trimmedUrl = url.trim();
  if (!isStashableUrl(trimmedUrl)) {
    throw new Error('Unsupported or invalid URL scheme. Use http://, https://, etc.');
  }

  const created = await browser.bookmarks.create({
    parentId,
    title: title.trim() || trimmedUrl,
    url: trimmedUrl,
    index,
  });

  return {
    id: created.id,
    parentId: created.parentId,
    index: created.index,
    url: created.url,
    title: created.title,
    dateAdded: created.dateAdded,
  };
}

/**
 * Creates a new folder inside a parent folder.
 */
export async function createFolderNode(
  parentId: string,
  title: string,
  index?: number
): Promise<BookmarkItem> {
  const created = await browser.bookmarks.create({
    parentId,
    title: title.trim() || 'New Folder',
    index,
  });

  return {
    id: created.id,
    parentId: created.parentId,
    index: created.index,
    title: created.title,
    dateAdded: created.dateAdded,
    childrenCount: 0,
  };
}

/**
 * Renames or changes the URL of an existing bookmark or folder.
 */
export async function updateBookmarkNode(
  id: string,
  changes: { title?: string; url?: string }
): Promise<void> {
  if (changes.url && !isStashableUrl(changes.url)) {
    throw new Error('Unsupported or invalid URL scheme. Use http://, https://, etc.');
  }
  await browser.bookmarks.update(id, changes);
}

/**
 * Deletes a bookmark or folder (recursively if folder).
 */
export async function deleteBookmarkNode(id: string, isFolder: boolean): Promise<void> {
  if (isFolder) {
    await browser.bookmarks.removeTree(id);
  } else {
    await browser.bookmarks.remove(id);
  }
}

/**
 * Opens a bookmark URL in a new tab or active tab.
 */
export async function openBookmarkUrl(url: string, newTab = true): Promise<void> {
  if (newTab) {
    await browser.tabs.create({ url, active: true });
  } else {
    await browser.tabs.update({ url });
  }
}

/**
 * Opens all valid bookmark tabs inside a folder.
 */
export async function openFolderTabs(
  folderId: string,
  newWindow = false
): Promise<number> {
  const tree = await browser.bookmarks.getSubTree(folderId);
  const root = tree[0];
  if (!root) return 0;

  const urls: string[] = [];
  type BrowserTreeNode = (typeof tree)[number];

  function collectUrls(node?: BrowserTreeNode) {
    if (!node) return;
    if (node.url && isStashableUrl(node.url)) {
      urls.push(node.url);
    }
    if (node.children) {
      for (const child of node.children) {
        collectUrls(child);
      }
    }
  }
  collectUrls(root);

  if (urls.length === 0) return 0;

  if (newWindow) {
    await browser.windows.create({ url: urls });
  } else {
    for (const url of urls) {
      await browser.tabs.create({ url, active: false });
    }
  }
  return urls.length;
}

/**
 * Restores all tabs in a folder and optionally deletes the folder (MakTabs / OneTab style).
 */
export async function restoreAndOptionallyRemoveFolder(
  folderId: string,
  removeAfter: boolean,
  newWindow = false
): Promise<number> {
  const count = await openFolderTabs(folderId, newWindow);
  if (removeAfter && count > 0) {
    await browser.bookmarks.removeTree(folderId);
  }
  return count;
}

/**
 * Searches bookmarks by query string across the entire browser bookmark store.
 */
export async function searchBookmarksApi(query: string): Promise<BookmarkItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const results = await browser.bookmarks.search(trimmed);
  return results.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    index: node.index,
    url: node.url,
    title: node.title || (node.url ? node.url : 'Untitled Folder'),
    dateAdded: node.dateAdded,
  }));
}

/**
 * Extracts a clean hostname for display and monogram generation.
 */
export function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Returns a 1-2 character monogram for website cards.
 */
export function getDomainInitial(domain: string): string {
  if (!domain) return '?';
  const clean = domain.replace(/[^a-zA-Z0-9]/g, '');
  return clean ? clean.slice(0, 2).toUpperCase() : '?';
}

/**
 * Deterministically computes an attractive pastel background color for domain badges.
 */
export function getDomainColor(domain: string): string {
  if (!domain) return '#64748b';
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash << 5) - hash + domain.charCodeAt(i);
    hash |= 0;
  }
  const colors = [
    '#2563eb', // blue
    '#4f46e5', // indigo
    '#7c3aed', // violet
    '#db2777', // pink
    '#e11d48', // rose
    '#ea580c', // orange
    '#d97706', // amber
    '#059669', // emerald
    '#0d9488', // teal
    '#0284c7', // light blue
  ];
  const index = Math.abs(hash) % colors.length;
  return colors[index] ?? '#2563eb';
}
