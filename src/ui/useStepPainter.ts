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
  onPaintStart,
  onPaintEnd,
}: StepPainterOptions) {
  const paintValue = useRef<number | null>(null)
  const lastCell = useRef<string | null>(null)

  const key = (t: StepTarget) => `${t.trackIndex}:${t.stepIndex}`

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = readTarget(event.target as Element)
      if (!target) return

      const value = isOn(target) ? 0 : 1
      paintValue.current = value
      lastCell.current = key(target)

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

      onPaint(target, paintValue.current)
    },
    [onPaint],
  )

  const endPaint = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (paintValue.current === null) return
      paintValue.current = null
      lastCell.current = null
      container.current?.releasePointerCapture?.(event.pointerId)
      onPaintEnd?.()
    },
    [container, onPaintEnd],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPaint,
    onPointerCancel: endPaint,
  }
}
