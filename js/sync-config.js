// Where the sync service lives (see sync-worker/README.md). Empty means this copy of Atlas has no sync
// service, and Settings says so instead of offering sync.
export const SYNC_URL_DEFAULT = 'https://atlas-sync.marva-abouei.workers.dev';

/**
 * The address to use. On this computer (localhost) a developer can point Atlas at a test service by
 * setting localStorage "identity-lab-coach:sync-url"; the published site always uses the default.
 */
export function syncUrl() {
  try {
    const local = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
    const override = local ? localStorage.getItem('identity-lab-coach:sync-url') : null;
    return (override || SYNC_URL_DEFAULT).replace(/\/+$/, '');
  } catch {
    return SYNC_URL_DEFAULT.replace(/\/+$/, '');
  }
}
