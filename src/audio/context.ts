/**
 * The AudioContext lives here as a module-level singleton, deliberately outside
 * React. Screens come and go; the audio engine must not, or navigating away from
 * the sequencer would tear down playback and force another unlock gesture.
 */

export type Engine = {
  ctx: AudioContext
  /** Everything audible connects here, not to ctx.destination. */
  master: GainNode
}

type ContextFactory = () => AudioContext

let engine: Engine | null = null
let createContext: ContextFactory = () => new AudioContext()

function build(): Engine {
  const ctx = createContext()

  const master = ctx.createGain()
  master.gain.value = 0.8

  // Eight drums landing on the same step will clip without this.
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -10
  compressor.knee.value = 12
  compressor.ratio.value = 8
  compressor.attack.value = 0.002
  compressor.release.value = 0.12

  master.connect(compressor).connect(ctx.destination)

  return { ctx, master }
}

export function getEngine(): Engine {
  if (!engine) engine = build()
  return engine
}

/** True once an engine exists, without creating one as a side effect. */
export function hasEngine(): boolean {
  return engine !== null
}

/**
 * Must be called from inside a real user gesture. An AudioContext starts
 * 'suspended' and browsers will not let it run until a tap resumes it.
 */
export async function unlock(): Promise<AudioContextState> {
  // Ask iOS for a playback session so the silent switch does not mute us.
  if (typeof navigator !== 'undefined' && navigator.audioSession) {
    navigator.audioSession.type = 'playback'
  }

  const { ctx } = getEngine()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  return ctx.state
}

export function engineState(): AudioContextState | 'uninitialised' {
  return engine ? engine.ctx.state : 'uninitialised'
}

/* --- test seams --------------------------------------------------------- */

export function setContextFactory(factory: ContextFactory): void {
  createContext = factory
}

export function resetEngine(): void {
  engine = null
}
