import { describe, expect, it } from 'vitest'
import { barsLabel, ordinal, timeLabel } from '../places'

describe('saying which place', () => {
  it('names one bar when the pass is one bar long', () => {
    expect(barsLabel({ bar: 4, time: 1, bars: 1 })).toBe('bar 5')
  })

  it('spans the bars a longer beat stands in, so a measure can be read off', () => {
    expect(barsLabel({ bar: 4, time: 1, bars: 2 })).toBe('bars 5–6')
  })

  it('counts from 1 as the song grid does', () => {
    expect(barsLabel({ bar: 0, time: 1, bars: 1 })).toBe('bar 1')
  })

  it('says which time through it is', () => {
    expect(timeLabel({ bar: 6, time: 3, bars: 2 })).toBe('3rd time it plays')
  })
})

describe('ordinals', () => {
  it('handles the ones that are not "th"', () => {
    expect([1, 2, 3, 4].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th'])
  })

  it('keeps the teens on "th", where the last digit lies', () => {
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th'])
  })

  it('goes back to the pattern past twenty', () => {
    expect([21, 22, 23].map(ordinal)).toEqual(['21st', '22nd', '23rd'])
  })
})
