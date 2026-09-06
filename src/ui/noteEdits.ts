/**
 * Pure geometry for editing a note by dragging it. No DOM, no state -- the
 * gesture layer decides which mode a grab means, and this decides what the
 * note becomes.
 */

export type NoteShape = { pitch: number; start: number; length: number }

export type NoteRole = 'single' | 'start' | 'middle' | 'end'

/**
 * Which part of a run of cells a given cell is. Shared by the piano roll and
 * the song grid: a held note and a clip are drawn as one continuous block by
 * exactly the same rule.
 */
export function spanRole(start: number, length: number, step: number): NoteRole {
  const last = start + length - 1
  if (start === last) return 'single'
  if (step === start) return 'start'
  if (step === last) return 'end'
  return 'middle'
}

/** What the piano roll draws while a gesture is in progress. */
export type NotePreview = {
  shape: NoteShape
  /** The note being edited, hidden in favour of the preview. */
  editing: string | null
}

export type EditMode =
  /** Slide the whole note; its length never changes. */
  | 'move'
  /** Drag the left edge; the right edge stays put. */
  | 'resize-start'
  /** Drag the right edge; the left edge stays put. */
  | 'resize-end'
  /**
   * A one-step note is its own start and its own end, so there is no correct
   * single answer. Whichever way it is pulled, it grows.
   */
  | 'resize-either'

export function editModeFor(role: NoteRole): EditMode {
  switch (role) {
    case 'start':
      return 'resize-start'
    case 'end':
      return 'resize-end'
    case 'middle':
      return 'move'
    case 'single':
      return 'resize-either'
  }
}

function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export type Cursor = { pitch: number; step: number }

/**
 * The note's new shape, given where the drag started and where it is now.
 *
 * Resizing never crosses over itself: pulling an edge past its opposite stops
 * at one step rather than inverting the note.
 */
export function applyEdit(
  origin: NoteShape,
  mode: EditMode,
  grabStep: number,
  cursor: Cursor,
  totalSteps: number,
): NoteShape {
  const lastStep = totalSteps - 1

  switch (mode) {
    case 'move': {
      const start = clampTo(
        origin.start + (cursor.step - grabStep),
        0,
        Math.max(0, totalSteps - origin.length),
      )
      // Moving follows the row under the finger, which is how a wrong note
      // gets fixed without redrawing it.
      return { pitch: cursor.pitch, start, length: origin.length }
    }

    case 'resize-end': {
      const last = clampTo(cursor.step, origin.start, lastStep)
      return { pitch: origin.pitch, start: origin.start, length: last - origin.start + 1 }
    }

    case 'resize-start': {
      const originalLast = origin.start + origin.length - 1
      const start = clampTo(cursor.step, 0, originalLast)
      return { pitch: origin.pitch, start, length: originalLast - start + 1 }
    }

    case 'resize-either': {
      if (cursor.step > origin.start) {
        return applyEdit(origin, 'resize-end', grabStep, cursor, totalSteps)
      }
      if (cursor.step < origin.start) {
        return applyEdit(origin, 'resize-start', grabStep, cursor, totalSteps)
      }
      return origin
    }
  }
}

/**
 * Where a fresh drag from `start` to `step` ends up, as a note.
 *
 * `minLength` is what a press alone lays down. It is one for a melody note,
 * but a song clip starts at its beat's full length, so that tapping a four-bar
 * beat places four bars rather than silently truncating it to one.
 */
export function draftFrom(
  pitch: number,
  start: number,
  step: number,
  minLength = 1,
): NoteShape {
  // Dragging leftward does not extend a new note backwards; a note is drawn
  // from where it begins, the way a piano roll is read.
  return { pitch, start, length: Math.max(minLength, step - start + 1) }
}

export function sameShape(a: NoteShape, b: NoteShape): boolean {
  return a.pitch === b.pitch && a.start === b.start && a.length === b.length
}
