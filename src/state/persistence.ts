/**
 * Asking the browser not to clear saved work on its own.
 *
 * By default a site's storage is "best effort": the browser may delete it
 * when the device runs low on space. Persistent storage takes it off that
 * list, leaving deletion to the user. Chrome grants it quietly to installed or
 * well-used sites, Firefox asks, and Safari decides for itself. None of them
 * promise anything, so this is a request, not a guarantee -- which is why the
 * backup file exists.
 */

export type Persistence = 'persisted' | 'best-effort' | 'unknown'

function storageManager(): StorageManager | null {
  return typeof navigator !== 'undefined' && navigator.storage ? navigator.storage : null
}

/** What the browser has agreed to, without asking for anything. */
export async function storagePersistence(): Promise<Persistence> {
  const storage = storageManager()
  if (!storage || typeof storage.persisted !== 'function') return 'unknown'
  try {
    return (await storage.persisted()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unknown'
  }
}

let asking: Promise<Persistence> | null = null

/**
 * Asks once per visit, at the moment there is first something worth keeping.
 * Firefox puts the question to the user, so it is asked when they have just
 * pressed Save rather than the moment the app opens. Never throws: being
 * refused is no reason for the save itself to fail.
 */
export function requestPersistence(): Promise<Persistence> {
  if (!asking) {
    asking = (async () => {
      const storage = storageManager()
      if (!storage || typeof storage.persist !== 'function') return 'unknown'
      try {
        if (await storage.persisted?.()) return 'persisted'
        return (await storage.persist()) ? 'persisted' : 'best-effort'
      } catch {
        return 'unknown'
      }
    })()
  }
  return asking
}

/** For tests: forget that the question was asked. */
export function resetPersistenceRequest(): void {
  asking = null
}

/**
 * Whether this is Safari on an iPhone or iPad, outside the Home Screen app.
 * There, Safari deletes everything a site saved after seven days without a
 * visit -- the one case where installing is what keeps the work, not a nicety.
 */
export function isIosBrowserTab(): boolean {
  return typeof navigator !== 'undefined' && navigator.standalone === false
}
