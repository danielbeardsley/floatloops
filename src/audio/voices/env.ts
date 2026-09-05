/**
 * Envelope helpers shared by every voice.
 */

/**
 * exponentialRampToValueAtTime cannot target zero, so fades run down to this
 * floor instead. -80dB is inaudible.
 */
export const LEVEL_FLOOR = 0.0001

/** A couple of milliseconds of fade-in, so attacks do not click. */
export const ATTACK = 0.002

/** Extra time before stopping a source, so its tail is not cut off. */
export const TAIL = 0.02

/**
 * Schedules a percussive envelope: a fast ramp up to `level`, then an
 * exponential fall to silence over `decay` seconds.
 */
export function percussiveEnvelope(
  param: AudioParam,
  when: number,
  level: number,
  decay: number,
  attack: number = ATTACK,
): void {
  param.setValueAtTime(0, when)
  param.linearRampToValueAtTime(Math.max(level, LEVEL_FLOOR), when + attack)
  param.exponentialRampToValueAtTime(LEVEL_FLOOR, when + decay)
}

export function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** Disconnects a voice's nodes once its source has finished playing. */
export function cleanupAfter(
  source: { onended: ((this: AudioScheduledSourceNode, ev: Event) => void) | null },
  nodes: AudioNode[],
): void {
  source.onended = () => {
    for (const node of nodes) node.disconnect()
  }
}
