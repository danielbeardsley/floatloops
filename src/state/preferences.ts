/**
 * Per-device preferences, kept in localStorage.
 *
 * These are conveniences, not data: they are not part of a pattern, they do not
 * sync anywhere, and losing them costs nothing. Every access is guarded because
 * reading localStorage throws outright in some contexts -- a private window, or
 * a browser set to block site data.
 */

const KEY = 'floatloops:preferences'

export type Preferences = {
  /** Whether the grid scrolls to keep up with the playhead. */
  followPlayhead: boolean
  /** Whether the piano roll is expanded. Closed by default: the drums are the
   *  main event, and twelve tracks plus eight pitches is a lot of grid. */
  melodyOpen: boolean
  /** Whether the drum rows are expanded. Open by default, being the main event
   *  -- it is folded away to get at the melody, not the other way round. */
  drumsOpen: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  followPlayhead: true,
  melodyOpen: false,
  drumsOpen: true,
}

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFERENCES

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES

    const stored = parsed as Partial<Record<keyof Preferences, unknown>>
    const read = (key: keyof Preferences) =>
      typeof stored[key] === 'boolean' ? (stored[key] as boolean) : DEFAULT_PREFERENCES[key]

    return {
      followPlayhead: read('followPlayhead'),
      melodyOpen: read('melodyOpen'),
      drumsOpen: read('drumsOpen'),
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // A preference that cannot be remembered is not worth failing over.
  }
}
