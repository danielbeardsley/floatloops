import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export type StepTarget = { trackIndex: number; stepIndex: number }

/** Reads a cell's coordinates back off the DOM. */
export function readTarget(element: Element | null): StepTarget | null {
  const cell = element?.closest<HTMLElement>('[data-track][data-step]')
  if (!cell) return null

  const trackIndex = Number(cell.dataset.track)
  const stepIndex = Number(cell.dataset.step)
  if (!Number.isInteger(trackIndex) || !Number.isInteger(stepIndex)) return null

  return { trackIndex, stepIndex }
}

export type StepPainterOptions = {
  container: RefObject<HTMLElement | null>
  isOn: (target: StepTarget) => boolean
  onPaint: (target: StepTarget, value: number) => void
  /**
   * Puts a cell back as it was when a stroke is abandoned. Separate from
   * onPaint because undoing a stroke must not sound the drum it restores.
   */
  onRevert?: (target: StepTarget, value: number) => void
  onPaintStart?: () => void
  onPaintEnd?: () => void
}

/**
 * Hold and drag across cells to fill or clear a run of them in one gesture.
 *
 * The mode is decided by the first cell touched -- start on an empty step and
 * you are drawing, start on a filled one and you are erasing -- so a drag never
 * flip-flops cells it passes over.
 *
 * Once the pointer is captured, every move event reports the cell the gesture
 * *started* on, so the cell actually under the finger has to be found with
 * elementFromPoint. Without that the drag silently paints nothing.
 */
export function useStepPainter({
  container,
  isOn,
  onPaint,
  onRevert,
  onPaintStart,
  onPaintEnd,
}: StepPainterOptions) {
  const paintValue = useRef<number | null>(null)
  const lastCell = useRef<string | null>(null)
  /** Every cell this stroke has changed, and what it was, so it can be undone. */
  const stroke = useRef<{ target: StepTarget; was: number }[]>([])

  const key = (t: StepTarget) => `${t.trackIndex}:${t.stepIndex}`

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // One stroke at a time. A second finger used to start its own, taking
      // the mode and the undo record with it -- so the first finger carried on
      // painting to the second one's rules, and the first one's cells could no
      // longer be put back.
      if (paintValue.current !== null) return

      const target = readTarget(event.target as Element)
      if (!target) return

      const was = isOn(target) ? 1 : 0
      const value = was > 0 ? 0 : 1
      paintValue.current = value
      lastCell.current = key(target)
      stroke.current = [{ target, was }]

      container.current?.setPointerCapture?.(event.pointerId)
      onPaintStart?.()
      onPaint(target, value)
    },
    [container, isOn, onPaint, onPaintStart],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (paintValue.current === null) return

      const target = readTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (!target) return

      const cell = key(target)
      if (cell === lastCell.current) return
      lastCell.current = cell

      stroke.current.push({ target, was: isOn(target) ? 1 : 0 })
      onPaint(target, paintValue.current)
    },
    [onPaint],
  )

  const endPaint = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (paintValue.current === null) return
      paintValue.current = null
      lastCell.current = null
      stroke.current = []
      container.current?.releasePointerCapture?.(event.pointerId)
      onPaintEnd?.()
    },
    [container, onPaintEnd],
  )

  /**
   * Puts the whole stroke back and gives up on it. Called when a second finger
   * turns the gesture into a scroll: the cell the first finger happened to land
   * on was never meant to be painted.
   */
  const abort = useCallback(() => {
    if (paintValue.current === null) return

    for (let i = stroke.current.length - 1; i >= 0; i -= 1) {
      const { target, was } = stroke.current[i]
      ;(onRevert ?? onPaint)(target, was)
    }

    paintValue.current = null
    lastCell.current = null
    stroke.current = []
    onPaintEnd?.()
  }, [onPaint, onPaintEnd, onRevert])

  return {
    abort,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPaint,
    onPointerCancel: endPaint,
  }
}
