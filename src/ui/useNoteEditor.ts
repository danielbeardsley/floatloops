import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  applyEdit,
  draftFrom,
  editModeFor,
  type EditMode,
  type NotePreview,
  type NoteRole,
  type NoteShape,
} from './noteEdits'

export type { NotePreview }

/**
 * The row a gesture is on. Called `pitch` because the piano roll came first;
 * in the song grid the same number is a row index, which is why moving between
 * rows can be locked off (see `lockLane`).
 */
export type NoteTarget = { pitch: number; stepIndex: number }

/** Which data attribute carries the row. `data-row` in the song grid. */
export type LaneAttr = 'pitch' | 'row'

export function readNoteTarget(
  element: Element | null,
  lane: LaneAttr = 'pitch',
): NoteTarget | null {
  const cell = element?.closest<HTMLElement>(`[data-${lane}][data-step]`)
  if (!cell) return null

  const pitch = Number(cell.dataset[lane])
  const stepIndex = Number(cell.dataset.step)
  if (!Number.isInteger(pitch) || !Number.isInteger(stepIndex)) return null

  return { pitch, stepIndex }
}

export type NoteUnderCell = { id: string; role: NoteRole; shape: NoteShape }

export type NoteEditorOptions = {
  container: RefObject<HTMLElement | null>
  /** Defaults to the piano roll's `data-pitch`. */
  lane?: LaneAttr
  /**
   * Keeps a drag on the row it started on. The song grid sets this: a row *is*
   * a beat, so dragging a clip upwards would silently change which beat plays
   * rather than move it.
   */
  lockLane?: boolean
  /**
   * How much a press alone draws, per lane. One step for a melody note; the
   * song grid returns the row's beat length, so a press places the whole beat.
   * Resizing afterwards is unaffected -- shortening a clip stays possible, it
   * just has to be asked for.
   */
  minDraw?: (lane: number) => number
  /** The note covering a cell, if there is one, and which part of it. */
  noteUnder: (target: NoteTarget) => NoteUnderCell | null
  totalSteps: () => number
  onPreviewChange: (preview: NotePreview | null) => void
  onDraw: (shape: NoteShape) => void
  onEdit: (id: string, shape: NoteShape) => void
  onRemove: (id: string) => void
}

type Gesture =
  | { kind: 'draw'; shape: NoteShape }
  | {
      kind: 'edit'
      id: string
      mode: EditMode
      origin: NoteShape
      grabStep: number
      shape: NoteShape
      /** Whether the pointer has visited any cell other than the one grabbed. */
      moved: boolean
    }

/**
 * Every piano-roll gesture: drawing a new note, dragging either of its edges,
 * sliding it around, and deleting it.
 *
 * Which of those a press means is decided entirely by the cell it lands on --
 * an edge, the middle, or empty space. A press that never moves is a delete,
 * which is the only way to remove a note now that a press on one begins an
 * edit rather than ending the note.
 *
 * Edits are previewed and committed on release rather than applied as the
 * finger moves: dragging across a neighbouring note would otherwise consume it
 * on the way past, with no way back.
 */
export function useNoteEditor({
  container,
  lane = 'pitch',
  lockLane = false,
  minDraw,
  noteUnder,
  totalSteps,
  onPreviewChange,
  onDraw,
  onEdit,
  onRemove,
}: NoteEditorOptions) {
  const gesture = useRef<Gesture | null>(null)

  const publish = useCallback(
    (next: Gesture | null) => {
      gesture.current = next
      if (!next) {
        onPreviewChange(null)
        return
      }
      onPreviewChange({
        shape: next.shape,
        editing: next.kind === 'edit' ? next.id : null,
      })
    },
    [onPreviewChange],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = readNoteTarget(event.target as Element, lane)
      if (!target) return

      container.current?.setPointerCapture?.(event.pointerId)

      const existing = noteUnder(target)
      if (existing) {
        publish({
          kind: 'edit',
          id: existing.id,
          mode: editModeFor(existing.role),
          origin: existing.shape,
          grabStep: target.stepIndex,
          shape: existing.shape,
          moved: false,
        })
        return
      }

      publish({
        kind: 'draw',
        shape: draftFrom(
          target.pitch,
          target.stepIndex,
          target.stepIndex,
          minDraw?.(target.pitch) ?? 1,
        ),
      })
    },
    [container, lane, minDraw, noteUnder, publish],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = gesture.current
      if (!current) return

      const target = readNoteTarget(document.elementFromPoint(event.clientX, event.clientY), lane)
      if (!target) return

      if (current.kind === 'draw') {
        // A new note stays on the row it started on: letting a drag wander
        // between rows makes it far too easy to draw one you did not mean.
        if (target.pitch !== current.shape.pitch) return

        const shape = draftFrom(
          current.shape.pitch,
          current.shape.start,
          target.stepIndex,
          minDraw?.(current.shape.pitch) ?? 1,
        )
        if (shape.length === current.shape.length) return
        publish({ ...current, shape })
        return
      }

      // With the lane locked, a move slides along the row it grabbed and
      // nothing else; the row under the finger is ignored rather than obeyed.
      const pitch = lockLane ? current.origin.pitch : target.pitch

      const moved =
        current.moved || target.stepIndex !== current.grabStep || pitch !== current.origin.pitch

      const shape = applyEdit(
        current.origin,
        current.mode,
        current.grabStep,
        { pitch, step: target.stepIndex },
        totalSteps(),
      )

      publish({ ...current, shape, moved })
    },
    [lane, lockLane, minDraw, publish, totalSteps],
  )

  const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = gesture.current
      if (!current) return

      publish(null)
      container.current?.releasePointerCapture?.(event.pointerId)

      if (current.kind === 'draw') {
        onDraw(current.shape)
        return
      }

      // A press that never went anywhere is a tap, and a tap deletes.
      if (!current.moved) onRemove(current.id)
      else onEdit(current.id, current.shape)
    },
    [container, onDraw, onEdit, onRemove, publish],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
  }
}
