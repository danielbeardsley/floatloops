import type { GhostSource } from '../state/alignment'
import type { NoteRole } from './noteEdits'

/**
 * The rest of the song, flattened into something a cell can read.
 *
 * `ghostsAt` keeps the rows apart, because which of them to draw is a choice.
 * Once that choice is made a cell only needs to know how loudly to whisper,
 * which is what these levels are.
 */
export const GHOST_NONE = 0
/** Only a row the song has switched off lands here. */
export const GHOST_MUTED = 1
/** Something you would actually hear lands here. */
export const GHOST_SOUNDING = 2

export type GhostMarks = {
  /** Per track of the kit, a level for each step of the beat being edited. */
  drums: number[][]
  /** Per pitch, the same. */
  notes: number[][]
}

/**
 * Merges the rows into one set of marks, leaving out the hidden ones.
 *
 * A muted row still draws: it is part of the arrangement being written
 * around, and dropping it would make a beat look free of something that is
 * about to be switched back on. Where a muted and a sounding row land on the
 * same step, the sounding one wins -- the fainter mark has nothing to add.
 */
export function mergeGhosts(
  sources: readonly GhostSource[],
  hidden: ReadonlySet<string> = new Set(),
): GhostMarks {
  const shown = sources.filter((source) => !hidden.has(source.rowId))
  const level = (source: GhostSource) => (source.muted ? GHOST_MUTED : GHOST_SOUNDING)

  return {
    drums: overlay(shown, level, (source) => source.drums, (velocity) => velocity > 0),
    notes: overlay(shown, level, (source) => source.notes, (on) => on),
  }
}

function overlay<T>(
  sources: readonly GhostSource[],
  level: (source: GhostSource) => number,
  lanesOf: (source: GhostSource) => T[][],
  lit: (value: T) => boolean,
): number[][] {
  const merged: number[][] = []

  for (const source of sources) {
    lanesOf(source).forEach((lane, laneIndex) => {
      const row = (merged[laneIndex] ??= new Array<number>(lane.length).fill(GHOST_NONE))
      lane.forEach((value, step) => {
        if (lit(value)) row[step] = Math.max(row[step], level(source))
      })
    })
  }

  return merged
}

/**
 * Which part of a run of ghosted steps this one is, so a held note reads as
 * one bar rather than a row of separate blocks.
 *
 * Derived from its neighbours rather than from the note that made it: by this
 * point the note has been merged with everything else on the pitch, and a note
 * cut short by its own beat's loop point should read as cut -- which is what
 * looking at the step next door gives for free.
 */
export function ghostRole(lane: readonly number[] | undefined, step: number): NoteRole | null {
  if (!lane || !lane[step]) return null

  const before = step > 0 && lane[step - 1] > GHOST_NONE
  const after = lane[step + 1] > GHOST_NONE

  if (before && after) return 'middle'
  if (before) return 'end'
  if (after) return 'start'
  return 'single'
}
