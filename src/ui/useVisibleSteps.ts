import { useLayoutEffect, useState, type RefObject } from 'react'
import { visibleSteps, type StepWindow } from './visibleSteps'

/** One column and the gap after it. Keep in step with --cell and --gap. */
const COLUMN_WIDTH = 66

/**
 * Follows the grid's scroll and reports which steps are worth drawing.
 *
 * A layout effect rather than an ordinary one, so the guess this starts with
 * is corrected before the first paint rather than after it.
 */
export function useVisibleSteps(
  container: RefObject<HTMLElement | null>,
  totalSteps: number,
  labelWidth: number,
): StepWindow {
  const [shown, setShown] = useState<StepWindow>(() =>
    visibleSteps({
      scrollLeft: 0,
      viewportWidth: 0,
      totalSteps,
      labelWidth,
      columnWidth: COLUMN_WIDTH,
    }),
  )

  useLayoutEffect(() => {
    const root = container.current
    if (!root) return

    const measure = () => {
      const next = visibleSteps({
        scrollLeft: root.scrollLeft,
        viewportWidth: root.clientWidth,
        totalSteps,
        labelWidth,
        columnWidth: COLUMN_WIDTH,
      })
      // Whole measures at a time, so scrolling within one redraws nothing.
      setShown((prev) => (prev.from === next.from && prev.to === next.to ? prev : next))
    }

    measure()
    root.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)

    return () => {
      root.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [container, totalSteps, labelWidth])

  return shown
}
