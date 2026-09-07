import { noteAt, noteRole, type Melody } from '../state/schema'
import { PITCH_COUNT } from '../audio/scale'
import { spanRole, type NotePreview, type NoteRole } from './noteEdits'

export type CellFill = {
  role: NoteRole
  /** True while the note is still being dragged out and not yet committed. */
  draft: boolean
  /** The committed note under this cell, if any. */
  noteId: string | null
}

/**
 * What to draw in one piano-roll cell.
 *
 * The note being dragged wins over whatever is underneath, because committing
 * replaces overlapping notes -- so the preview shows what you are about to get,
 * not what is there now. A note being edited is hidden wherever it used to be,
 * so it appears to move rather than to be duplicated.
 */
export function cellFill(
  melody: Melody,
  preview: NotePreview | null,
  pitch: number,
  step: number,
): CellFill | null {
  if (preview && preview.shape.pitch === pitch) {
    const { start, length } = preview.shape
    const last = start + length - 1
    if (step >= start && step <= last) {
      return { role: spanRole(start, length, step), draft: true, noteId: null }
    }
  }

  const note = noteAt(melody, pitch, step)
  if (!note) return null
  if (preview && preview.editing === note.id) return null

  return { role: noteRole(note, step), draft: false, noteId: note.id }
}

/** Whether the note continues past this cell, so the gap should be bridged. */
export function bridgesGap(fill: CellFill | null): boolean {
  return fill !== null && (fill.role === 'start' || fill.role === 'middle')
}

/**
 * Blue through purple as the scale rises, so pitch is readable at a glance.
 *
 * The hues are spread across however many pitches the scale has rather than
 * stepped by a fixed amount, so growing the scale stretches the same gradient
 * instead of running the top rows off the end of it into red.
 */
const HUE_LOW = 205
const HUE_HIGH = 282

export function pitchColor(pitch: number): string {
  const span = Math.max(1, PITCH_COUNT - 1)
  return `hsl(${HUE_LOW + ((HUE_HIGH - HUE_LOW) * pitch) / span} 72% 62%)`
}
