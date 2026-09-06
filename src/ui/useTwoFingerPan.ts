import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export type Point = { x: number; y: number }

/** The middle of every finger currently down. */
export function centroid(points: Iterable<Point>): Point {
  let x = 0
  let y = 0
  let count = 0

  for (const point of points) {
    x += point.x
    y += point.y
    count += 1
  }

  return count === 0 ? { x: 0, y: 0 } : { x: x / count, y: y / count }
}

/**
 * How far to move the scroll offsets so the content follows the fingers.
 *
 * Inverted, because scrolling right moves the content left: dragging two
 * fingers rightwards should bring what is off to the left into view, the way
 * dragging a map does.
 */
export function panBy(from: Point, to: Point): Point {
  return { x: from.x - to.x, y: from.y - to.y }
}

export type TwoFingerPanOptions = {
  container: RefObject<HTMLElement | null>
  /**
   * Called when the second finger lands, to abandon whatever the first one had
   * begun. Reaching for a scroll should not leave a stray note behind.
   */
  onStart?: () => void
  onEnd?: () => void
}

/**
 * Two fingers drag the grid in both directions, from anywhere -- including
 * over the cells, which are `touch-action: none` precisely so the browser will
 * never scroll them itself.
 *
 * It engages only when the first finger came down on a cell. Everywhere else
 * the browser is already panning, and a second panner on top of it would move
 * the grid twice as fast.
 *
 * There is no inertia: this moves the scroll offsets directly, so it stops
 * when the fingers do. A flick that coasts would mean reimplementing what the
 * browser does properly on every surface that is not a cell, for a grid only a
 * few screens wide.
 */
export function useTwoFingerPan({ container, onStart, onEnd }: TwoFingerPanOptions) {
  const points = useRef(new Map<number, Point>())
  const anchor = useRef<Point | null>(null)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const first = points.current.size === 0
      if (first && !(event.target as Element).closest?.('.cell')) return

      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (points.current.size === 2) {
        anchor.current = centroid(points.current.values())
        onStart?.()
      }
    },
    [onStart],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const point = points.current.get(event.pointerId)
      if (!point) return

      point.x = event.clientX
      point.y = event.clientY

      const root = container.current
      if (!root || !anchor.current || points.current.size < 2) return

      const now = centroid(points.current.values())
      const by = panBy(anchor.current, now)
      anchor.current = now

      root.scrollLeft += by.x
      root.scrollTop += by.y
    },
    [container],
  )

  const endPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!points.current.delete(event.pointerId)) return
      if (points.current.size >= 2 || !anchor.current) return

      // One finger left. It does not go back to painting: the gesture it would
      // have been was abandoned when the second finger arrived.
      anchor.current = null
      onEnd?.()
    },
    [onEnd],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
  }
}
