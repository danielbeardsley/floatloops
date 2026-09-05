import { noteAt, noteRole, type Melody } from '../state/schema'
import type { NoteDraft } from './useNoteDrawer'

export type CellFill = {
  role: 'single' | 'start' | 'middle' | 'end'
  /** True while the note is still being dragged out and not yet committed. */
  draft: boolean
  /** The committed note under this cell, if any. */
  noteId: string | null
}

/**
 * What to draw in one piano-roll cell.
 *
 * The note being dragged wins over whatever is underneath, because committing
 * replaces overlapping notes -- so the preview should show what you are about
 * to get, not what is there now.
 */
export function cellFill(
  melody: Melody,
  draft: NoteDraft | null,
  pitch: number,
  step: number,
): CellFill | null {
  if (draft && draft.pitch === pitch) {
    const last = draft.start + draft.length - 1
    if (step >= draft.start && step <= last) {
      return {
        role: roleWithin(draft.start, last, step),
        draft: true,
        noteId: null,
      }
    }
  }

  const note = noteAt(melody, pitch, step)
  if (!note) return null

  return { role: noteRole(note, step), draft: false, noteId: note.id }
}

function roleWithin(start: number, last: number, step: number): CellFill['role'] {
  if (start === last) return 'single'
  if (step === start) return 'start'
  if (step === last) return 'end'
  return 'middle'
}

/** Whether the note continues past this cell, so the gap should be bridged. */
export function bridgesGap(fill: CellFill | null): boolean {
  return fill !== null && (fill.role === 'start' || fill.role === 'middle')
}

/** Blue through purple as the scale rises, so pitch is readable at a glance. */
export function pitchColor(pitch: number): string {
  return `hsl(${205 + pitch * 11} 72% 62%)`
}
