import { STEPS_PER_MEASURE } from '../audio/timing'

/**
 * Which slice of a beat is worth building elements for.
 *
 * A beat is as long as whoever is writing it wants, and every column of one
 * costs a button per drum track and another per pitch -- two dozen elements a
 * column, none of which a tablet can show more than about twenty of at once.
 * Left alone, a forty-bar beat asks the browser to lay out fifteen thousand
 * buttons to put twenty on the screen.
 *
 * So the rows draw the columns in view and leave the rest as empty width.
 * What that costs is a window that has to be right: too narrow and a scroll
 * runs off the end of what was drawn, so this errs wide everywhere it can --
 * whole measures, a measure of margin either side, and everything under the
 * sticky label column, which is cheaper to draw than to reason about.
 *
 * Held apart from the DOM so the arithmetic can be checked on its own, which
 * is the part that would otherwise only fail on a real screen.
 */

export type StepWindow = {
  /** First step to render. */
  from: number
  /** One past the last step to render. */
  to: number
}

/**
 * How much to draw before anything has been measured -- a fresh mount, or a
 * test's zero-sized DOM. Wider than any screen this runs on, because being
 * wrong this way costs a moment's work and being wrong the other way is a
 * hole where the grid should be.
 */
export const UNMEASURED_MEASURES = 4

/** Drawn either side of what is in view, so a scroll never outruns it. */
export const OVERSCAN_MEASURES = 1

export type GridViewport = {
  /** How far the grid is scrolled, in pixels. */
  scrollLeft: number
  /** The visible width of the grid, in pixels. Zero until it is measured. */
  viewportWidth: number
  totalSteps: number
  /** Width of the sticky label column, which covers the leftmost cells. */
  labelWidth: number
  /** One column plus the gap that follows it. */
  columnWidth: number
}

/** Rounds down to the start of the measure a step falls in. */
function measureStart(step: number): number {
  return Math.floor(step / STEPS_PER_MEASURE) * STEPS_PER_MEASURE
}

/** Rounds up to the end of the measure a step falls in. */
function measureEnd(step: number): number {
  return Math.ceil(step / STEPS_PER_MEASURE) * STEPS_PER_MEASURE
}

export function visibleSteps(view: GridViewport): StepWindow {
  const total = Number.isFinite(view.totalSteps) ? Math.max(0, Math.floor(view.totalSteps)) : 0
  if (total === 0) return { from: 0, to: 0 }

  const unmeasured =
    !Number.isFinite(view.viewportWidth) ||
    view.viewportWidth <= 0 ||
    !Number.isFinite(view.columnWidth) ||
    view.columnWidth <= 0 ||
    !Number.isFinite(view.scrollLeft)

  if (unmeasured) {
    return { from: 0, to: Math.min(total, UNMEASURED_MEASURES * STEPS_PER_MEASURE) }
  }

  const overscan = OVERSCAN_MEASURES * STEPS_PER_MEASURE
  // From the scroller's own left edge rather than from where the cells start,
  // which draws the strip behind the label column as well. A column of waste
  // against never having to know what the padding is.
  const firstShown = (view.scrollLeft - view.labelWidth) / view.columnWidth
  const lastShown = (view.scrollLeft + view.viewportWidth) / view.columnWidth

  const from = Math.max(0, Math.min(total, measureStart(firstShown) - overscan))
  const to = Math.max(from, Math.min(total, measureEnd(lastShown) + overscan))

  return { from, to }
}
