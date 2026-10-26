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
 * Resolves the Bookmarks Bar folder across Chromium ("1" / "Bookmarks bar")
 * and Gecko ("toolbar_____" / "Bookmarks Toolbar").
 */
export async function getBookmarksBarFolderId(): Promise<string | undefined> {
  try {
    const tree = await browser.bookmarks.getTree();
    const rootChildren = tree[0]?.children ?? [];

    const bookmarksBar = rootChildren.find((node) => {
      const title = (node.title || '').toLowerCase();
      return (
        node.id === '1' ||
        node.id === 'toolbar_____' ||
        title.includes('bar') ||
        title.includes('toolbar')
      );
    });

    if (bookmarksBar?.id) {
      return bookmarksBar.id;
    }
    // Fallback to first child (in Chromium, index 0 is always Bookmarks bar)
    return rootChildren[0]?.id;
  } catch (err) {
    console.warn('Could not inspect bookmark tree for Bookmarks Bar:', err);
    return undefined;
  }
}

/**
 * Finds or creates the root 'makTabs' bookmark folder.
 * Defaults to Bookmarks Bar ("Bookmarks bar" / "toolbar_____") for 1-click access.
 */
export async function getOrCreateMakTabsFolder(): Promise<string> {
  const matches = await browser.bookmarks.search({ title: MAKTABS_FOLDER_NAME });
  const existingFolder = matches.find((item) => !item.url);
  if (existingFolder?.id) {
    return existingFolder.id;
  }

  const bookmarksBarId = await getBookmarksBarFolderId();
  const created = await browser.bookmarks.create({
    parentId: bookmarksBarId,
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

export interface BreadcrumbSegment {
  id: string;
  title: string;
}

export interface DestinationFolderOption {
  id: string;
  title: string;
  path: string; // e.g. "makTabs → music → flute"
  breadcrumbs: BreadcrumbSegment[];
  depth: number;
  isMakTabsRoot?: boolean;
  isUnderMakTabs?: boolean;
}

export const RECENT_DESTINATIONS_STORAGE_KEY = 'maktabs_recent_destinations';

/**
 * Returns formatted default timestamped title for session folders.
 */
export function getDefaultSessionTitle(tabCount: number): string {
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
  return `${dateStr}, ${timeStr} (${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'})`;
}

/**
 * Retrieves the list of recent destination folder IDs from local storage.
 */
export async function getRecentDestinationIds(): Promise<string[]> {
  try {
    const res = await browser.storage.local.get(RECENT_DESTINATIONS_STORAGE_KEY);
    const list = res[RECENT_DESTINATIONS_STORAGE_KEY];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Persists a destination folder ID to the front of recent destinations list.
 */
export async function saveRecentDestinationId(folderId: string): Promise<void> {
  if (!folderId) return;
  try {
    const current = await getRecentDestinationIds();
    const updated = [folderId, ...current.filter((id) => id !== folderId)].slice(0, 5);
    await browser.storage.local.set({ [RECENT_DESTINATIONS_STORAGE_KEY]: updated });
  } catch (err) {
    console.warn('Failed to save recent destination folder:', err);
  }
}

/**
 * Recursively retrieves all bookmark folders formatted with breadcrumb paths.
 * Folders inside or including makTabs are prioritized at the top with clean
 * paths starting at "makTabs" (e.g. "makTabs → music → flute").
 */
export async function getDestinationFolders(): Promise<DestinationFolderOption[]> {
  try {
    // Ensure makTabs root exists
    const makTabsRootId = await getOrCreateMakTabsFolder();
    const tree = await browser.bookmarks.getTree();
    const rootNodes = tree[0]?.children ?? [];

    const makTabsFolders: DestinationFolderOption[] = [];
    const otherFolders: DestinationFolderOption[] = [];

    type RawBookmarkNode = (typeof rootNodes)[number];

    function traverse(
      node: RawBookmarkNode,
      parentPath: string[],
      isUnderMakTabs: boolean,
      parentBreadcrumbs: BreadcrumbSegment[]
    ) {
      if (node.url) return; // Only process folders

      const isRootContainer = node.id === '0' || node.id === 'root________';
      const nodeTitle = node.title || (isRootContainer ? 'Root' : 'Untitled Folder');
      const isMakTabs =
        node.id === makTabsRootId ||
        nodeTitle.toLowerCase() === MAKTABS_FOLDER_NAME.toLowerCase();
      const currentIsUnderMakTabs = isUnderMakTabs || isMakTabs;

      let currentPath: string[];
      let currentBreadcrumbs: BreadcrumbSegment[];

      if (isRootContainer) {
        currentPath = [];
        currentBreadcrumbs = [];
      } else if (isMakTabs) {
        // Anchor breadcrumb path directly at makTabs for clean display
        currentPath = [MAKTABS_FOLDER_NAME];
        currentBreadcrumbs = [{ id: node.id, title: MAKTABS_FOLDER_NAME }];
      } else {
        currentPath = [...parentPath, nodeTitle];
        currentBreadcrumbs = [...parentBreadcrumbs, { id: node.id, title: nodeTitle }];
      }

      if (!isRootContainer && currentPath.length > 0) {
        const option: DestinationFolderOption = {
          id: node.id,
          title: nodeTitle,
          path: currentPath.join(' → '),
          breadcrumbs: currentBreadcrumbs,
          depth: currentPath.length - 1,
          isMakTabsRoot: isMakTabs,
          isUnderMakTabs: currentIsUnderMakTabs,
        };

        if (currentIsUnderMakTabs) {
          makTabsFolders.push(option);
        } else {
          otherFolders.push(option);
        }
      }

      if (node.children) {
        for (const child of node.children) {
          traverse(child, currentPath, currentIsUnderMakTabs, currentBreadcrumbs);
        }
      }
    }

    for (const root of rootNodes) {
      traverse(root, [], false, []);
    }

    // Sort: Ensure makTabs root is first, then makTabs subfolders, followed by other folders
    makTabsFolders.sort((a, b) => {
      if (a.isMakTabsRoot) return -1;
      if (b.isMakTabsRoot) return 1;
      return a.path.localeCompare(b.path);
    });

    otherFolders.sort((a, b) => a.path.localeCompare(b.path));

    return [...makTabsFolders, ...otherFolders];
  } catch (err) {
    console.warn('Failed to load destination folders:', err);
    return [];
  }
}

/**
 * Resolves or creates a nested subfolder path under a parent folder.
 * For example: parentId + ['music', 'flute'] will find or create 'music' under parentId,
 * and then find or create 'flute' under 'music', returning 'flute's id.
 */
export async function resolveOrCreateSubfolderPath(
  parentId: string,
  pathSegments: string[]
): Promise<string> {
  let currentParentId = parentId;

  for (const segment of pathSegments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const contents = await getFolderContents(currentParentId);
    const existing = contents.find(
      (item) => !item.url && item.title.toLowerCase() === trimmed.toLowerCase()
    );

    if (existing) {
      currentParentId = existing.id;
    } else {
      const created = await browser.bookmarks.create({
        parentId: currentParentId,
        title: trimmed,
      });
      currentParentId = created.id;
    }
  }

  return currentParentId;
}

/**
 * Stashes the active tab in the current window into a destination folder.
 */
export async function stashCurrentTab(
  closeAfter = false,
  destinationFolderId?: string,
  customTitle?: string
): Promise<StashResult> {
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

    let folderId = destinationFolderId || (await getOrCreateMakTabsFolder());
    let finalTitle =
      customTitle && customTitle.trim()
        ? customTitle.trim()
        : activeTab.title || activeTab.url;

    // If title has slashes, resolve path
    if (finalTitle.includes('/')) {
      const segments = finalTitle.split('/').map((s) => s.trim()).filter(Boolean);
      if (segments.length > 1) {
        const intermediate = segments.slice(0, -1);
        folderId = await resolveOrCreateSubfolderPath(folderId, intermediate);
        finalTitle = segments[segments.length - 1] ?? (activeTab.title || activeTab.url);
      }
    }

    await browser.bookmarks.create({
      parentId: folderId,
      title: finalTitle,
      url: activeTab.url,
      index: 0,
    });

    if (closeAfter && activeTab.id !== undefined) {
      await browser.tabs.remove(activeTab.id);
    }

    await saveRecentDestinationId(folderId);

    return {
      success: true,
      count: 1,
      message: closeAfter
        ? 'Saved and closed this tab'
        : `Saved "${finalTitle}"`,
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
 * Stashes all eligible tabs in the current window into the destination folder.
 * If createSubfolder is true and customTitle is non-empty, creates an enclosing session folder.
 * If createSubfolder is false or customTitle is empty, tabs are saved directly into the destination folder.
 */
export async function stashAllTabs(
  closeAfter = false,
  destinationFolderId?: string,
  customTitle?: string,
  createSubfolder = true
): Promise<StashResult> {
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

    let targetParentId = destinationFolderId || (await getOrCreateMakTabsFolder());
    const trimmedTitle = customTitle?.trim() || '';

    let sessionFolderTitle = '';
    if (createSubfolder && trimmedTitle) {
      if (trimmedTitle.includes('/')) {
        const segments = trimmedTitle.split('/').map((s) => s.trim()).filter(Boolean);
        if (segments.length > 1) {
          const intermediate = segments.slice(0, -1);
          targetParentId = await resolveOrCreateSubfolderPath(targetParentId, intermediate);
          sessionFolderTitle = segments[segments.length - 1] ?? '';
        } else {
          sessionFolderTitle = segments[0] ?? trimmedTitle;
        }
      } else {
        sessionFolderTitle = trimmedTitle;
      }
    }

    let finalContainerId = targetParentId;
    if (createSubfolder && sessionFolderTitle) {
      const createdFolder = await browser.bookmarks.create({
        parentId: targetParentId,
        title: sessionFolderTitle,
        index: 0,
      });
      finalContainerId = createdFolder.id;
    }

    let savedCount = 0;
    const tabIdsToClose: number[] = [];

    for (const tab of validTabs) {
      if (tab.url) {
        try {
          await browser.bookmarks.create({
            parentId: finalContainerId,
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

    await saveRecentDestinationId(targetParentId);

    const destinationDesc = sessionFolderTitle ? sessionFolderTitle : 'selected folder';

    return {
      success: savedCount > 0,
      count: savedCount,
      message: closeAfter
        ? `Saved and closed ${savedCount} tabs`
        : `Saved ${savedCount} tabs to ${destinationDesc}`,
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
        isMakTabsRoot: (node.title || '').toLowerCase() === MAKTABS_FOLDER_NAME.toLowerCase(),
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
 * Recursively searches for a folder node in a tree matching a predicate.
 */
export function findFolderInTree(
  folders: FolderNode[],
  predicate: (f: FolderNode) => boolean
): FolderNode | null {
  for (const f of folders) {
    if (predicate(f)) return f;
    const sub = findFolderInTree(f.subfolders, predicate);
    if (sub) return sub;
  }
  return null;
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
 * Constructs a lazy placeholder URL that pauses page load until the user focuses the tab.
 */
export function getLazyUrl(url: string, title?: string): string {
  return browser.runtime.getURL(
    `/lazy.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || url)}`
  );
}

/**
 * Retrieves the user's Memory Saver preference (defaults to true).
 */
export async function getMemorySaverPreference(): Promise<boolean> {
  try {
    const res = await browser.storage.local.get('maktabs_memory_saver');
    return res.maktabs_memory_saver !== false;
  } catch {
    return true;
  }
}

/**
 * Persists the user's Memory Saver preference.
 */
export async function setMemorySaverPreference(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ maktabs_memory_saver: enabled });
}

/**
 * Opens all valid bookmark tabs inside a folder, with optional Memory Saver lazy loading.
 */
export async function openFolderTabs(
  folderId: string,
  newWindow = false,
  lazy = false
): Promise<number> {
  const tree = await browser.bookmarks.getSubTree(folderId);
  const root = tree[0];
  if (!root) return 0;

  const itemsToOpen: { url: string; title: string }[] = [];
  type BrowserTreeNode = (typeof tree)[number];

  function collectUrls(node?: BrowserTreeNode) {
    if (!node) return;
    if (node.url && isStashableUrl(node.url)) {
      itemsToOpen.push({ url: node.url, title: node.title || node.url });
    }
    if (node.children) {
      for (const child of node.children) {
        collectUrls(child);
      }
    }
  }
  collectUrls(root);

  if (itemsToOpen.length === 0) return 0;

  const finalUrls = itemsToOpen.map((item) =>
    lazy ? getLazyUrl(item.url, item.title) : item.url
  );

  if (newWindow) {
    await browser.windows.create({ url: finalUrls });
  } else {
    for (const url of finalUrls) {
      await browser.tabs.create({ url, active: false });
    }
  }
  return itemsToOpen.length;
}

/**
 * Restores all tabs in a folder and optionally deletes the folder (MakTabs / OneTab style).
 */
export async function restoreAndOptionallyRemoveFolder(
  folderId: string,
  removeAfter: boolean,
  newWindow = false,
  lazy = false
): Promise<number> {
  const count = await openFolderTabs(folderId, newWindow, lazy);
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

/**
 * Constructs a favicon URL for a bookmarked URL.
 * In Chrome/Chromium, uses the official internal chrome-extension://<id>/_favicon/ cache (100% offline & local).
 * In Firefox or environments where _favicon is unavailable, falls back to direct origin /favicon.ico.
 */
export function getFaviconUrl(url?: string, size = 32): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }

    const isFirefox =
      typeof navigator !== 'undefined' &&
      navigator.userAgent.toLowerCase().includes('firefox');

    // Chromium built-in favicon API (MV3 with 'favicon' permission)
    if (!isFirefox && browser?.runtime?.getURL) {
      const getUrl = browser.runtime.getURL as (path: string) => string;
      const faviconApiUrl = new URL(getUrl('/_favicon/'));
      faviconApiUrl.searchParams.set('pageUrl', url);
      faviconApiUrl.searchParams.set('size', size.toString());
      return faviconApiUrl.toString();
    }

    // Direct origin favicon fallback
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return '';
  }
}
