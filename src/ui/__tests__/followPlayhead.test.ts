import { describe, expect, it } from 'vitest'
import { planFollow } from '../followPlayhead'
import { STEPS_PER_MEASURE } from '../../audio/timing'

const PLAYING = { step: 0, painting: false, follow: true }

describe('planFollow', () => {
  it('scrolls to the measure the playhead is in', () => {
    expect(planFollow(PLAYING, null)).toEqual({ scrollTo: 0, shownMeasure: 0 })
  })

  it('scrolls again when the playhead crosses into the next measure', () => {
    const plan = planFollow({ ...PLAYING, step: STEPS_PER_MEASURE }, 0)
    expect(plan.scrollTo).toBe(1)
  })

  it('stays put for every step within the measure already on screen', () => {
    for (let step = 0; step < STEPS_PER_MEASURE; step += 1) {
      expect(planFollow({ ...PLAYING, step }, 0).scrollTo).toBeNull()
    }
  })
})

describe('planFollow leaves the grid alone', () => {
  it('while a finger is drawing', () => {
    expect(planFollow({ ...PLAYING, step: STEPS_PER_MEASURE, painting: true }, 0).scrollTo).toBeNull()
  })

  it('when following is switched off', () => {
    expect(planFollow({ ...PLAYING, step: STEPS_PER_MEASURE, follow: false }, 0).scrollTo).toBeNull()
  })

  it('when the sequencer is stopped', () => {
    expect(planFollow({ ...PLAYING, step: null }, 0).scrollTo).toBeNull()
  })
})

describe('planFollow resumes cleanly', () => {
  it('forgets which measure was on screen whenever it stops following', () => {
    expect(planFollow({ ...PLAYING, follow: false }, 3).shownMeasure).toBeNull()
    expect(planFollow({ ...PLAYING, painting: true }, 3).shownMeasure).toBeNull()
    expect(planFollow({ ...PLAYING, step: null }, 3).shownMeasure).toBeNull()
  })

  it('catches up at once rather than waiting a full lap', () => {
    // Following was off, so nothing is remembered; the next step re-centres
    // even though the playhead is mid-measure.
    const plan = planFollow({ ...PLAYING, step: STEPS_PER_MEASURE * 2 + 5 }, null)
    expect(plan.scrollTo).toBe(2)
  })
})
