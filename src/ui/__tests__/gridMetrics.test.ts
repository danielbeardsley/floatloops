import { describe, expect, it } from 'vitest'
import { gridMetrics, UNSTYLED } from '../gridMetrics'

function grid(vars: Record<string, string>): HTMLElement {
  const element = document.createElement('div')
  for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value)
  document.body.append(element)
  return element
}

describe('gridMetrics', () => {
  it('reads the column sizes off the element', () => {
    const element = grid({ '--label-w': '80px', '--cell': '40px', '--gap': '4px' })

    expect(gridMetrics(element)).toEqual({ labelWidth: 80, columnWidth: 44 })
  })

  it('follows the element when a breakpoint moves the sizes', () => {
    const element = grid({ '--label-w': '150px', '--cell': '60px', '--gap': '6px' })
    expect(gridMetrics(element)).toEqual({ labelWidth: 150, columnWidth: 66 })

    element.style.setProperty('--label-w', '80px')
    element.style.setProperty('--cell', '40px')
    element.style.setProperty('--gap', '4px')

    expect(gridMetrics(element)).toEqual({ labelWidth: 80, columnWidth: 44 })
  })

  /*
   * Falling back rather than reporting a zero-wide column: a column of no width
   * makes every step in the beat look like it is in view at once, which is the
   * one answer that costs more than being a little wrong.
   */
  it('falls back where the properties resolve to nothing', () => {
    expect(gridMetrics(grid({}))).toEqual(UNSTYLED)
    expect(gridMetrics(null)).toEqual(UNSTYLED)
  })

  it('keeps the half it can read', () => {
    const element = grid({ '--label-w': '80px' })

    expect(gridMetrics(element)).toEqual({
      labelWidth: 80,
      columnWidth: UNSTYLED.columnWidth,
    })
  })
})
