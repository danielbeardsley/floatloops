import {
  MAJOR_DEGREES,
  PENTATONIC_DEGREES,
  PITCHES_PER_OCTAVE,
  PITCHES_TOP_DOWN,
  pitchClass,
} from '../audio/scale'
import type { Note } from './schema'

/**
 * Which rows of the piano roll to draw.
 *
 * The scale has every half-tone in it, which is more rows than anyone wants to
 * look at and more than a kid can pick between. So the roll shows a chosen few:
 * the five that cannot clash, the seven of a key, all twelve, or only the ones
 * already in use.
 *
 * This is a view, not a limit. Nothing here changes a note, and no note is ever
 * hidden by it -- see `visiblePitches`.
 */
export type MelodyView = 'pentatonic' | 'scale' | 'chromatic' | 'used'

export type MelodyViewDef = {
  id: MelodyView
  /** Shown in the roll's view picker. Kept short so the row fits a phone. */
  name: string
}

/**
 * Picker order, fewest rows first, so the list reads as one dial from the
 * safest choice to the widest one. "In use" is not on that scale at all, which
 * is why it sits at the end.
 */
export const MELODY_VIEWS: readonly MelodyViewDef[] = [
  { id: 'pentatonic', name: '5 notes' },
  { id: 'scale', name: '8 notes' },
  { id: 'chromatic', name: 'All 12' },
  { id: 'used', name: 'In use' },
] as const

/** Pentatonic, because a beat with nothing in it should be safe to poke at. */
export const DEFAULT_MELODY_VIEW: MelodyView = 'pentatonic'

/** C, so the roll opens on the same rows it has always shown. */
export const DEFAULT_MELODY_KEY = 0

const VIEW_IDS = new Set<string>(MELODY_VIEWS.map((view) => view.id))

export function isMelodyView(value: unknown): value is MelodyView {
  return typeof value === 'string' && VIEW_IDS.has(value)
}

export function isMelodyKey(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < PITCHES_PER_OCTAVE
  )
}

/** Only the scale views are built on a root, so only they can be transposed. */
export function viewHasKey(view: MelodyView): boolean {
  return view === 'pentatonic' || view === 'scale'
}

function degreesFor(view: MelodyView): readonly number[] | null {
  if (view === 'pentatonic') return PENTATONIC_DEGREES
  if (view === 'scale') return MAJOR_DEGREES
  return null
}

export type RowOptions = {
  view: MelodyView
  /** Root of the scale views, 0 being C. */
  key: number
  /** Whether to close the roll up around the notes that are there. */
  narrow: boolean
  notes: readonly Note[]
}

/**
 * The rows to draw, highest first.
 *
 * A row holding a note is always drawn, whatever the view says. A note on a
 * hidden row could not be moved, shortened or deleted, and would go on sounding
 * from somewhere you cannot see -- so switching views can only ever add rows to
 * what you can already reach, never take one away.
 *
 * `narrow` then closes the roll up around the notes that exist, top and bottom.
 * With nothing written yet it does nothing, since there is no range to narrow
 * to, and "In use" falls back to the pentatonic rows for the same reason: an
 * empty roll with no rows at all is one you cannot write the first note into.
 */
export function visiblePitches({ view, key, narrow, notes }: RowOptions): number[] {
  const used = new Set(notes.map((note) => note.pitch))
  const degrees = degreesFor(view === 'used' && used.size === 0 ? 'pentatonic' : view)

  const inView = (pitch: number) =>
    view === 'chromatic' || (degrees !== null && degrees.includes(pitchClass(pitch, key)))

  const low = narrow && used.size > 0 ? Math.min(...used) : 0
  const high = narrow && used.size > 0 ? Math.max(...used) : PITCHES_TOP_DOWN.length - 1

  return PITCHES_TOP_DOWN.filter(
    (pitch) => pitch >= low && pitch <= high && (inView(pitch) || used.has(pitch)),
  )
}
