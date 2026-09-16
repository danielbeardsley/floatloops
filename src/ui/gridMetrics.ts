/**
 * How wide the grid's columns are, read back off the element that carries them.
 *
 * These live in CSS as custom properties because the breakpoints move them: a
 * phone gets smaller cells and a narrower track column than a tablet does. A
 * constant repeated over here would be right on one screen and wrong on the
 * next, and wrong quietly -- the window of columns worth drawing would land
 * beside the one actually in view, leaving a hole where the grid should be.
 *
 * So the code that has to know a size asks the element for it instead.
 */

export type GridMetrics = {
  /** Width of the sticky track column, which covers the leftmost cells. */
  labelWidth: number
  /** One column plus the gap that follows it. */
  columnWidth: number
}

/**
 * What to assume when no stylesheet has been read -- a test's bare DOM, or an
 * element that is not there yet. The tablet's sizes, being the ones the grid
 * was built at.
 */
export const UNSTYLED: GridMetrics = { labelWidth: 150, columnWidth: 66 }

/** A custom property as a number, or null where it resolves to nothing. */
function pixels(style: CSSStyleDeclaration, name: string): number | null {
  const value = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(value) ? value : null
}

export function gridMetrics(element: HTMLElement | null): GridMetrics {
  if (!element) return UNSTYLED

  const style = getComputedStyle(element)
  const label = pixels(style, '--label-w')
  const cell = pixels(style, '--cell')
  const gap = pixels(style, '--gap')

  return {
    labelWidth: label ?? UNSTYLED.labelWidth,
    columnWidth: cell !== null && gap !== null ? cell + gap : UNSTYLED.columnWidth,
  }
}
