/**
 * Per-device preferences, kept in localStorage.
 *
 * These are conveniences, not data: they are not part of a pattern, they do not
 * sync anywhere, and losing them costs nothing. Every access is guarded because
 * reading localStorage throws outright in some contexts -- a private window, or
 * a browser set to block site data.
 */

import {
  DEFAULT_MELODY_KEY,
  DEFAULT_MELODY_VIEW,
  isMelodyKey,
  isMelodyView,
  type MelodyView,
} from './melodyView'

const KEY = 'floatloops:preferences'

export type Preferences = {
  /** Whether an edit saves itself, rather than waiting for the Save button. */
  autoSave: boolean
  /** Whether the grid scrolls to keep up with the playhead. */
  followPlayhead: boolean
  /** Whether the piano roll is expanded. Open by default, like the drums: a
   *  section you cannot see is one you do not know is there. */
  melodyOpen: boolean
  /** Whether the drum rows are expanded. Open by default, being the main event
   *  -- it is folded away to get at the melody, not the other way round. */
  drumsOpen: boolean
  /**
   * Whether the rest of the song shows through the beat being edited, and
   * sounds under it. On by default: arriving at a place in a song is asking
   * what else is there, and one switch covers both because seeing a beat you
   * cannot hear is worse than not seeing it at all.
   */
  showOthers: boolean
  /** Which rows of the piano roll are drawn. See melodyView.ts. */
  melodyView: MelodyView
  /** Root of the scale views, 0 being C. */
  melodyKey: number
  /** Whether the roll closes up around the notes that are there. */
  melodyNarrow: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  autoSave: false,
  followPlayhead: true,
  melodyOpen: true,
  drumsOpen: true,
  showOthers: true,
  melodyView: DEFAULT_MELODY_VIEW,
  melodyKey: DEFAULT_MELODY_KEY,
  melodyNarrow: false,
}

/** The preferences that are plain on/off switches, which most of them are. */
type FlagKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never
}[keyof Preferences]

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFERENCES

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES

    const stored = parsed as Partial<Record<keyof Preferences, unknown>>
    const read = (key: FlagKey) =>
      typeof stored[key] === 'boolean' ? (stored[key] as boolean) : DEFAULT_PREFERENCES[key]

    // Anything that is not a plain flag is checked against what it means
    // rather than its type: a view this build has never heard of, or a key
    // outside the octave, is a preference worth forgetting.
    return {
      autoSave: read('autoSave'),
      followPlayhead: read('followPlayhead'),
      melodyOpen: read('melodyOpen'),
      drumsOpen: read('drumsOpen'),
      showOthers: read('showOthers'),
      melodyView: isMelodyView(stored.melodyView) ? stored.melodyView : DEFAULT_MELODY_VIEW,
      melodyKey: isMelodyKey(stored.melodyKey) ? stored.melodyKey : DEFAULT_MELODY_KEY,
      melodyNarrow: read('melodyNarrow'),
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
