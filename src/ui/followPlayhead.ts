import { STEPS_PER_MEASURE } from '../audio/timing'

export type FollowInput = {
  /** Pattern step under the playhead, or null when stopped. */
  step: number | null
  /** Whether a finger is currently drawing on the grid. */
  painting: boolean
  /** Whether the user wants the grid to follow at all. */
  follow: boolean
}

export type FollowPlan = {
  /** Measure to scroll to, or null to leave the grid where it is. */
  scrollTo: number | null
  /** Measure now on screen, to be passed back in on the next call. */
  shownMeasure: number | null
}

/**
 * Decides whether the grid should scroll, given where the playhead is.
 *
 * Scrolling happens a measure at a time rather than a step at a time, which
 * would be unreadable. Following is suspended while someone is drawing --
 * yanking the grid out from under a finger is worse than losing sight of the
 * playhead -- and the remembered measure is cleared whenever following stops,
 * so it resumes at the next measure boundary rather than waiting a full lap.
 */
export function planFollow(
  { step, painting, follow }: FollowInput,
  shownMeasure: number | null,
): FollowPlan {
  if (step === null || painting || !follow) {
    return { scrollTo: null, shownMeasure: null }
  }

  const measure = Math.floor(step / STEPS_PER_MEASURE)
  if (measure === shownMeasure) return { scrollTo: null, shownMeasure }

  return { scrollTo: measure, shownMeasure: measure }
}
