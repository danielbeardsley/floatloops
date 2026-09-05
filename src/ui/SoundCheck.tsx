import { useCallback, useState } from 'react'
import { engineState, getEngine, unlock } from '../audio/context'
import { kick } from '../audio/voices/kick'
import { STEPS_PER_BEAT, stepTime } from '../audio/timing'

/**
 * Phase 1: one drum and a play button. Its job is to prove the awkward parts
 * work on a real tablet -- the AudioContext unlocking from a gesture, the
 * silent switch not muting us, and notes scheduled ahead of time landing in
 * the right place -- before anything is built on top of them.
 */

/** Scheduling exactly at currentTime can land in the past and be dropped. */
const NUDGE = 0.02

/** A little more headroom for a run of notes, so the first is never late. */
const LEAD_IN = 0.1

const BPM = 120

export function SoundCheck() {
  const [status, setStatus] = useState<string>(() => engineState())
  const [hits, setHits] = useState(0)
  const [flash, setFlash] = useState(false)

  const ensureAudio = useCallback(async () => {
    setStatus(await unlock())
    return getEngine()
  }, [])

  const pulse = useCallback(() => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 120)
  }, [])

  const hit = useCallback(async () => {
    const { ctx, master } = await ensureAudio()
    kick(ctx, master, ctx.currentTime + NUDGE)
    setHits((n) => n + 1)
    pulse()
  }, [ensureAudio, pulse])

  const playFourOnTheFloor = useCallback(async () => {
    const { ctx, master } = await ensureAudio()
    const start = ctx.currentTime + LEAD_IN
    for (let beat = 0; beat < 4; beat += 1) {
      kick(ctx, master, stepTime(start, BPM, beat * STEPS_PER_BEAT))
    }
    setHits((n) => n + 4)
    pulse()
  }, [ensureAudio, pulse])

  return (
    <section className="soundcheck">
      <button
        type="button"
        className={`pad${flash ? ' pad--hit' : ''}`}
        onPointerDown={hit}
        aria-label="Play kick drum"
      >
        <span className="pad__label">KICK</span>
      </button>

      <div className="soundcheck__side">
        <button type="button" className="button button--primary" onClick={playFourOnTheFloor}>
          Play 4 beats
        </button>

        <dl className="readout">
          <div className="readout__row">
            <dt>Audio</dt>
            <dd data-testid="engine-status">{status}</dd>
          </div>
          <div className="readout__row">
            <dt>Tempo</dt>
            <dd>{BPM} bpm</dd>
          </div>
          <div className="readout__row">
            <dt>Hits</dt>
            <dd data-testid="hit-count">{hits}</dd>
          </div>
        </dl>

        <p className="hint">
          Tap the pad. If you hear nothing on an iPad, check the silent switch --
          then tell me, because that is the bug this screen exists to catch.
        </p>
      </div>
    </section>
  )
}
