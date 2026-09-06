import { clipAt, clipRole, type SongRow } from '../state/song'
import { spanRole, type NotePreview, type NoteRole } from './noteEdits'

export type ClipFill = {
  role: NoteRole
  /** True while the clip is still being dragged out and not yet committed. */
  draft: boolean
  /** How many bars the clip covers. */
  length: number
  /** How many times the beat starts inside it, counting a pass cut short. */
  passes: number
  /** This bar is where the beat starts over -- the loop point. */
  loops: boolean
  /** This bar is part of a last pass the clip ends before the beat finishes. */
  cut: boolean
  clipId: string | null
}

/**
 * Where the beat stands at a given bar of a clip.
 *
 * A clip is measured in bars and the beat inside it loops, so the two lengths
 * are independent: four bars of a two-bar beat is two passes, three bars of it
 * is two passes with the second cut in half. Both of those are legitimate --
 * cutting to a fill is how arrangements work -- but neither is legible unless
 * the grid says where each pass begins and where one has been clipped.
 */
function passOf(
  start: number,
  length: number,
  patternBars: number,
  bar: number,
): Pick<ClipFill, 'passes' | 'loops' | 'cut'> {
  const bars = Math.max(1, patternBars)
  const offset = bar - start
  const remainder = length % bars

  return {
    passes: Math.ceil(length / bars),
    loops: offset > 0 && offset % bars === 0,
    cut: remainder !== 0 && offset >= length - remainder,
  }
}

/**
 * What to draw in one song-grid cell -- the same rule the piano roll uses, and
 * for the same reason: the clip being dragged wins over whatever is underneath,
 * because committing replaces what it overlaps.
 */
export function clipFill(
  row: SongRow,
  rowIndex: number,
  patternBars: number,
  preview: NotePreview | null,
  bar: number,
): ClipFill | null {
  // `pitch` is the row index here; the shared gesture layer names it for the
  // piano roll it was written for.
  if (preview && preview.shape.pitch === rowIndex) {
    const { start, length } = preview.shape
    if (bar >= start && bar < start + length) {
      return {
        role: spanRole(start, length, bar),
        draft: true,
        length,
        clipId: null,
        ...passOf(start, length, patternBars, bar),
      }
    }
  }

  const clip = clipAt(row, bar)
  if (!clip) return null
  if (preview && preview.editing === clip.id) return null

  return {
    role: clipRole(clip, bar),
    draft: false,
    length: clip.length,
    clipId: clip.id,
    ...passOf(clip.start, clip.length, patternBars, bar),
  }
}

/**
 * Whether the clip continues past this cell, so the grid gap gets bridged --
 * except at a loop point, where the gap is what shows the beat starting again.
 */
export function bridgesGap(fill: ClipFill | null): boolean {
  return fill !== null && (fill.role === 'start' || fill.role === 'middle')
}

/**
 * A colour per row, cycling. Not derived from the beat: the same beat on two
 * rows should still be told apart, and it is the row a finger aims at.
 */
const ROW_COLORS = [
  '#ff5c7a',
  '#4ecdc4',
  '#ffd166',
  '#a785e2',
  '#5aa9e6',
  '#ff9f68',
  '#6d7ff5',
  '#f062c8',
] as const

export function rowColor(rowIndex: number): string {
  return ROW_COLORS[rowIndex % ROW_COLORS.length]
}
