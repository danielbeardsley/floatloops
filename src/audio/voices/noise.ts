import { whiteNoiseBuffer } from '../noise'

/** A looping white-noise source, the raw material for snares, hats and claps. */
export function createNoiseSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  const source = ctx.createBufferSource()
  source.buffer = whiteNoiseBuffer(ctx)
  source.loop = true
  return source
}
