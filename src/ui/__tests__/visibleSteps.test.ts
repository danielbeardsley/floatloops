import { describe, expect, it } from 'vitest'
import { STEPS_PER_MEASURE } from '../../audio/timing'
import { UNMEASURED_MEASURES, visibleSteps } from '../visibleSteps'

const LABEL = 150
const COLUMN = 66
/** A landscape tablet, which is what this is built for. */
const SCREEN = 1024

function look(over: Partial<Parameters<typeof visibleSteps>[0]> = {}) {
  return visibleSteps({
    scrollLeft: 0,
    viewportWidth: SCREEN,
    totalSteps: 64 * STEPS_PER_MEASURE,
    labelWidth: LABEL,
    columnWidth: COLUMN,
    ...over,
  })
}

/** The step under a given point on the screen, as the grid lays them out. */
function stepAt(x: number, scrollLeft: number): number {
  return Math.floor((scrollLeft + x - LABEL) / COLUMN)
}

describe('visibleSteps', () => {
  it('covers everything on screen, at the start', () => {
    const shown = look({ scrollLeft: 0 })
    expect(shown.from).toBe(0)
    expect(shown.to).toBeGreaterThanOrEqual(stepAt(SCREEN, 0))
  })

  it('covers everything on screen, a long way in', () => {
    const scrollLeft = 40 * STEPS_PER_MEASURE * COLUMN
    const shown = look({ scrollLeft })

    expect(shown.from).toBeLessThanOrEqual(stepAt(LABEL, scrollLeft))
    expect(shown.to).toBeGreaterThanOrEqual(stepAt(SCREEN, scrollLeft))
  })

  // The point of the whole thing: what it costs to show a beat is what fits on
  // the screen, not how long the beat is.
  it('draws no more of a long beat than of a short one', () => {
    const scrollLeft = 40 * STEPS_PER_MEASURE * COLUMN
    const short = look({ scrollLeft, totalSteps: 8 * STEPS_PER_MEASURE })
    const long = look({ scrollLeft, totalSteps: 900 * STEPS_PER_MEASURE })

    expect(long.to - long.from).toBeLessThanOrEqual(8 * STEPS_PER_MEASURE)
    expect(short.to - short.from).toBeLessThanOrEqual(long.to - long.from)
  })

  // The window moves a measure at a time, so scrolling a whole bar's worth of
  // pixels redraws the rows a couple of times rather than on every scroll
  // event. The two ends move independently, which is the third state.
  it('changes only a couple of times per measure scrolled', () => {
    const measure = STEPS_PER_MEASURE * COLUMN
    const seen = new Set<string>()
    for (let x = 0; x < measure; x += 1) {
      seen.add(JSON.stringify(look({ scrollLeft: 10 * measure + x })))
    }

    expect(seen.size).toBeLessThanOrEqual(3)
  })

  it('lands on measure boundaries, so a bar is drawn whole or not at all', () => {
    for (const scrollLeft of [0, 137, 4000, 91_000]) {
      const shown = look({ scrollLeft })
      expect(shown.from % STEPS_PER_MEASURE).toBe(0)
      expect(shown.to % STEPS_PER_MEASURE).toBe(0)
    }
  })

  it('keeps a margin either side, so a scroll does not outrun what is drawn', () => {
    const scrollLeft = 40 * STEPS_PER_MEASURE * COLUMN
    const shown = look({ scrollLeft })

    expect(stepAt(LABEL, scrollLeft) - shown.from).toBeGreaterThanOrEqual(STEPS_PER_MEASURE)
    expect(shown.to - stepAt(SCREEN, scrollLeft)).toBeGreaterThanOrEqual(STEPS_PER_MEASURE)
  })

  it('never runs off either end of the beat', () => {
    const total = 8 * STEPS_PER_MEASURE
    expect(look({ scrollLeft: -500, totalSteps: total }).from).toBe(0)

    const end = look({ scrollLeft: 999_999, totalSteps: total })
    expect(end.to).toBe(total)
    expect(end.from).toBeLessThanOrEqual(end.to)
  })

  // A fresh mount, or a test's zero-sized DOM: a guess wide enough to cover
  // any screen beats a hole where the grid should be.
  it('guesses wide when there is nothing to measure yet', () => {
    const guess = UNMEASURED_MEASURES * STEPS_PER_MEASURE
    expect(look({ viewportWidth: 0 })).toEqual({ from: 0, to: guess })
    expect(look({ viewportWidth: Number.NaN })).toEqual({ from: 0, to: guess })
    expect(look({ columnWidth: 0 })).toEqual({ from: 0, to: guess })
    expect(look({ scrollLeft: Number.NaN })).toEqual({ from: 0, to: guess })
  })

  it('draws a beat shorter than the guess whole', () => {
    const total = 2 * STEPS_PER_MEASURE
    expect(look({ viewportWidth: 0, totalSteps: total })).toEqual({ from: 0, to: total })
  })

  it('has nothing to draw for a beat with no steps', () => {
    expect(look({ totalSteps: 0 })).toEqual({ from: 0, to: 0 })
  })
})
