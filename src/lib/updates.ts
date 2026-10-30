import { browser } from 'wxt/browser';

export const UPDATE_CHECK_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000; // 4 days in milliseconds
export const STORAGE_KEY_LAST_CHECK = 'maktabs_update_last_check';
export const STORAGE_KEY_REMOTE_VERSION = 'maktabs_update_remote_version';
export const STORAGE_KEY_DISMISSED_VERSION = 'maktabs_update_dismissed_version';

export const REPO_URL = 'https://github.com/rain64x/maktabs';
export const RELEASES_URL = 'https://github.com/rain64x/maktabs/releases';
export const RAW_PACKAGE_JSON_URL =
  'https://raw.githubusercontent.com/rain64x/maktabs/main/package.json';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  repoUrl: string;
  releasesUrl: string;
}

/**
 * Compares two semantic version strings (e.g. "0.2.1" vs "0.2.0").
 * Returns true if remote is strictly greater than current.
 */
export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);

  const [rMaj = 0, rMin = 0, rPatch = 0] = parse(remote);
  const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current);

  if (rMaj > cMaj) return true;
  if (rMaj < cMaj) return false;
  if (rMin > cMin) return true;
  if (rMin < cMin) return false;
  return rPatch > cPatch;
}

/**
 * Checks for extension updates at most once every 4 days.
 * If force is true, bypasses the interval check.
 */
export async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
  const currentVersion = browser.runtime.getManifest().version;

  try {
    const stored = await browser.storage.local.get([
      STORAGE_KEY_LAST_CHECK,
      STORAGE_KEY_REMOTE_VERSION,
      STORAGE_KEY_DISMISSED_VERSION,
    ]);

    const lastCheck =
      typeof stored[STORAGE_KEY_LAST_CHECK] === 'number'
        ? (stored[STORAGE_KEY_LAST_CHECK] as number)
        : 0;
    let remoteVersion =
      typeof stored[STORAGE_KEY_REMOTE_VERSION] === 'string'
        ? (stored[STORAGE_KEY_REMOTE_VERSION] as string)
        : '';
    const dismissedVersion =
      typeof stored[STORAGE_KEY_DISMISSED_VERSION] === 'string'
        ? (stored[STORAGE_KEY_DISMISSED_VERSION] as string)
        : '';

    const now = Date.now();
    const shouldFetch = force || !lastCheck || now - lastCheck > UPDATE_CHECK_INTERVAL_MS;

    if (shouldFetch) {
      try {
        const res = await fetch(RAW_PACKAGE_JSON_URL, { cache: 'no-cache' });
        if (res.ok) {
          const data = await res.json();
          if (data?.version && typeof data.version === 'string') {
            remoteVersion = data.version.trim();
            await browser.storage.local.set({
              [STORAGE_KEY_LAST_CHECK]: now,
              [STORAGE_KEY_REMOTE_VERSION]: remoteVersion,
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch MakTabs remote version:', err);
      }
    }

    const hasUpdate =
      Boolean(remoteVersion) &&
      isNewerVersion(remoteVersion, currentVersion) &&
      dismissedVersion !== remoteVersion;

    return {
      hasUpdate,
      currentVersion,
      latestVersion: remoteVersion || currentVersion,
      repoUrl: REPO_URL,
      releasesUrl: RELEASES_URL,
    };
  } catch (err) {
    console.warn('Failed to perform update check:', err);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      repoUrl: REPO_URL,
      releasesUrl: RELEASES_URL,
    };
  }
}

/**
 * Dismisses the update alert for the given version string.
 */
export async function dismissUpdate(version: string): Promise<void> {
  if (!version) return;
  try {
    await browser.storage.local.set({
      [STORAGE_KEY_DISMISSED_VERSION]: version,
    });
  } catch (err) {
    console.warn('Failed to dismiss update:', err);
  }
}
