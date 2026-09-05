import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export type NoteTarget = { pitch: number; stepIndex: number }

export type NoteDraft = { pitch: number; start: number; length: number }

export function readNoteTarget(element: Element | null): NoteTarget | null {
  const cell = element?.closest<HTMLElement>('[data-pitch][data-step]')
  if (!cell) return null

  const pitch = Number(cell.dataset.pitch)
  const stepIndex = Number(cell.dataset.step)
  if (!Number.isInteger(pitch) || !Number.isInteger(stepIndex)) return null

  return { pitch, stepIndex }
}

/** Where a drag from `start` to `step` ends up, as a note. */
export function draftFrom(pitch: number, start: number, step: number): NoteDraft {
  // Dragging leftward does not extend the note backwards; a note is drawn from
  // where it begins, the way a piano roll is read.
  return { pitch, start, length: Math.max(1, step - start + 1) }
}

export type NoteDrawerOptions = {
  container: RefObject<HTMLElement | null>
  /** The id of a note already covering this cell, if there is one. */
  noteIdAt: (target: NoteTarget) => string | null
  onRemove: (id: string) => void
  onCommit: (draft: NoteDraft) => void
  onDraftChange: (draft: NoteDraft | null) => void
}

/**
 * Draws notes in the piano roll: press an empty cell and drag right to set the
 * length, or press an existing note to delete it.
 *
 * The pitch is fixed by the cell the gesture starts on. Letting a drag wander
 * between rows would make it far too easy to draw a note you did not mean,
 * and a note that changes pitch partway is not a thing this format can hold.
 */
export function useNoteDrawer({
  container,
  noteIdAt,
  onRemove,
  onCommit,
  onDraftChange,
}: NoteDrawerOptions) {
  const draft = useRef<NoteDraft | null>(null)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = readNoteTarget(event.target as Element)
      if (!target) return

      const existing = noteIdAt(target)
      if (existing) {
        onRemove(existing)
        return
      }

      const next = draftFrom(target.pitch, target.stepIndex, target.stepIndex)
      draft.current = next
      container.current?.setPointerCapture?.(event.pointerId)
      onDraftChange(next)
    },
    [container, noteIdAt, onDraftChange, onRemove],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = draft.current
      if (!current) return

      const target = readNoteTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (!target || target.pitch !== current.pitch) return

      const next = draftFrom(current.pitch, current.start, target.stepIndex)
      if (next.length === current.length) return

      draft.current = next
      onDraftChange(next)
    },
    [onDraftChange],
  )

  const endDraw = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = draft.current
      if (!current) return

      draft.current = null
      container.current?.releasePointerCapture?.(event.pointerId)
      onDraftChange(null)
      onCommit(current)
    },
    [container, onCommit, onDraftChange],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDraw,
    onPointerCancel: endDraw,
  }
}
