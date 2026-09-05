/**
 * One second of white noise, generated once per AudioContext and reused by
 * every noise-based voice. Regenerating it per hit would be wasteful, and the
 * voices loop it anyway.
 */

const NOISE_SECONDS = 1

const cache = new WeakMap<BaseAudioContext, AudioBuffer>()

export function whiteNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = cache.get(ctx)
  if (cached) return cached

  const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    channel[i] = Math.random() * 2 - 1
  }

  cache.set(ctx, buffer)
  return buffer
}
