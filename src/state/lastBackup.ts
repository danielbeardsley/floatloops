/**
 * When a backup file was last made on this device, so the library can say how
 * old the safety net is. A convenience like the preferences, kept the same
 * way, and deliberately not in the backup itself: restoring one should not
 * make the device think it has just been backed up.
 */

const KEY = 'floatloops:lastBackup'

/** Past this, a library with something in it is worth a nudge. */
export const STALE_AFTER_DAYS = 14

const DAY = 24 * 60 * 60 * 1000

export function loadLastBackup(): number | null {
  try {
    const value = Number(window.localStorage.getItem(KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function saveLastBackup(at = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, String(at))
  } catch {
    // Only the reminder is lost.
  }
}

/** Whole calendar days between two moments, by the device's own clock. */
export function daysSince(at: number, now = Date.now()): number {
  const start = new Date(at)
  const end = new Date(now)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY))
}

export function describeLastBackup(at: number | null, now = Date.now()): string {
  if (at === null) return 'No backup saved on this device yet.'
  const days = daysSince(at, now)
  if (days === 0) return 'Last backup: today.'
  if (days === 1) return 'Last backup: yesterday.'
  return `Last backup: ${days} days ago.`
}

export function backupIsStale(at: number | null, now = Date.now()): boolean {
  return at === null || daysSince(at, now) >= STALE_AFTER_DAYS
}
