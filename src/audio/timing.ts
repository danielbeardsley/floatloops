/**
 * Pure timing math. Deliberately free of Web Audio so it can be unit tested,
 * and so the scheduler's correctness does not depend on a browser.
 */

/** Steps in one measure. The grid shows one measure at a time. */
export const STEPS_PER_MEASURE = 16

/** Steps per beat: the grid is in 16th notes, so four steps make a quarter note. */
export const STEPS_PER_BEAT = 4

export const MIN_BPM = 40
export const MAX_BPM = 240

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 120
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))
}

/** Seconds per quarter note. */
export function secondsPerBeat(bpm: number): number {
  return 60 / clampBpm(bpm)
}

/** Seconds per grid step (a 16th note). */
export function secondsPerStep(bpm: number): number {
  return secondsPerBeat(bpm) / STEPS_PER_BEAT
}

/** Absolute AudioContext time at which a given step should fire. */
export function stepTime(startTime: number, bpm: number, stepIndex: number): number {
  return startTime + stepIndex * secondsPerStep(bpm)
}

/** How many steps a pattern of the given measure count contains. */
export function stepCount(measures: number): number {
  return Math.max(1, Math.floor(measures)) * STEPS_PER_MEASURE
}
