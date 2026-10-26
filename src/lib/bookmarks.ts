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
