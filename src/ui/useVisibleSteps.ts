import { useLayoutEffect, useState, type RefObject } from 'react'
import { gridMetrics, UNSTYLED } from './gridMetrics'
import { visibleSteps, type StepWindow } from './visibleSteps'

/**
 * Follows the grid's scroll and reports which steps are worth drawing.
 *
 * A layout effect rather than an ordinary one, so the guess this starts with
 * is corrected before the first paint rather than after it.
 */
export function useVisibleSteps(
  container: RefObject<HTMLElement | null>,
  totalSteps: number,
): StepWindow {
  const [shown, setShown] = useState<StepWindow>(() =>
    visibleSteps({
      scrollLeft: 0,
      viewportWidth: 0,
      totalSteps,
      ...UNSTYLED,
    }),
  )

  useLayoutEffect(() => {
    const root = container.current
    if (!root) return

    // Re-read only on a resize: the column sizes come from a breakpoint, and a
    // resize is the one thing that can cross one. Asking the element on every
    // scroll event would be a style recalculation per frame of a drag.
    let metrics = gridMetrics(root)

    const measure = () => {
      const next = visibleSteps({
        scrollLeft: root.scrollLeft,
        viewportWidth: root.clientWidth,
        totalSteps,
        ...metrics,
      })
      // Whole measures at a time, so scrolling within one redraws nothing.
      setShown((prev) => (prev.from === next.from && prev.to === next.to ? prev : next))
    }

    const remeasure = () => {
      metrics = gridMetrics(root)
      measure()
    }

    measure()
    root.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', remeasure)

    return () => {
      root.removeEventListener('scroll', measure)
      window.removeEventListener('resize', remeasure)
    }
  }, [container, totalSteps])

  return shown
}
