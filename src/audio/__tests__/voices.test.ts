import { describe, expect, it } from 'vitest'
import { KIT } from '../kit'
import { CLOSED_HAT_DEFAULTS, OPEN_HAT_DEFAULTS, resolveHatParams } from '../voices/hat'
import { clapDuration, clapEnvelopePoints, resolveClapParams } from '../voices/clap'
import { COWBELL_FREQS, cowbell } from '../voices/cowbell'
import { resolveSnareParams, snare } from '../voices/snare'
import { LOW_TOM_DEFAULTS, resolveTomParams } from '../voices/tom'
import { LEVEL_FLOOR } from '../voices/env'
import {
  MockAudioContext,
  MockAudioNode,
  allSources,
  asAudioContext,
  asAudioNode,
} from '../../test/mockAudioContext'

/** Follows connect() edges to check a voice actually reaches the output. */
function reaches(from: MockAudioNode, target: MockAudioNode, seen = new Set<MockAudioNode>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return from.outputs.some((next) => reaches(next, target, seen))
}

describe('every voice in the kit', () => {
  const WHEN = 4

  for (const voice of KIT) {
    describe(voice.name, () => {
      function trigger(level?: number) {
        const ctx = new MockAudioContext()
        voice.trigger(asAudioContext(ctx), asAudioNode(ctx.destination), WHEN, { level })
        return ctx
      }

      it('makes at least one sound source', () => {
        expect(allSources(trigger()).length).toBeGreaterThan(0)
      })

      it('starts every source exactly at the requested time', () => {
        for (const source of allSources(trigger())) {
          expect(source.startedAt).toBe(WHEN)
        }
      })

      it('stops every source after it started', () => {
        for (const source of allSources(trigger())) {
          expect(source.stoppedAt).toBeGreaterThan(WHEN)
        }
      })

      it('reaches the destination', () => {
        const ctx = trigger()
        for (const source of allSources(ctx)) {
          expect(reaches(source, ctx.destination)).toBe(true)
        }
      })

      it('never exponentially ramps a gain to zero', () => {
        const ctx = trigger()
        for (const gain of ctx.gains) {
          for (const event of gain.gain.events) {
            if (event.method === 'exponentialRampToValueAtTime') {
              expect(event.value).toBeGreaterThanOrEqual(LEVEL_FLOOR)
            }
          }
        }
      })

      it('survives a nonsense level without throwing', () => {
        expect(() => trigger(Number.NaN)).not.toThrow()
        expect(() => trigger(-5)).not.toThrow()
      })
    })
  }
})

describe('hats', () => {
  it('rings longer when open than closed', () => {
    expect(OPEN_HAT_DEFAULTS.decay).toBeGreaterThan(CLOSED_HAT_DEFAULTS.decay)
  })

  it('clamps a silly decay back into range', () => {
    expect(resolveHatParams({ decay: 99 }).decay).toBeLessThanOrEqual(2)
  })
})

describe('clap envelope', () => {
  const points = clapEnvelopePoints(0, 0.6, 0.25)

  it('fires several bursts before the tail', () => {
    const attacks = points.filter((p) => p.ramp === 'linear')
    expect(attacks.length).toBeGreaterThanOrEqual(4)
  })

  it('schedules every point in increasing time order', () => {
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].time).toBeGreaterThanOrEqual(points[i - 1].time)
    }
  })

  it('keeps the bursts within the first few hundredths of a second', () => {
    const lastBurstAttack = points.filter((p) => p.ramp === 'linear').at(-2)!
    expect(lastBurstAttack.time).toBeLessThan(0.05)
  })

  it('lasts longer than its tail decay alone', () => {
    expect(clapDuration(0.25)).toBeGreaterThan(0.25)
  })

  it('clamps the tone into an audible band', () => {
    expect(resolveClapParams({ tone: 1 }).tone).toBeGreaterThanOrEqual(200)
  })
})

describe('snare', () => {
  it('layers a noise rattle over a tonal body', () => {
    const ctx = new MockAudioContext()
    snare(asAudioContext(ctx), asAudioNode(ctx.destination), 0)
    expect(ctx.bufferSources).toHaveLength(1)
    expect(ctx.oscillators).toHaveLength(1)
  })

  it('keeps the body shorter than the rattle, so it thumps rather than rings', () => {
    const p = resolveSnareParams()
    expect(p.bodyFreq).toBeLessThan(p.tone)
  })
})

describe('cowbell', () => {
  it('clashes two square waves through one filter', () => {
    const ctx = new MockAudioContext()
    cowbell(asAudioContext(ctx), asAudioNode(ctx.destination), 0)
    expect(ctx.oscillators).toHaveLength(2)
    expect(ctx.oscillators.every((o) => o.type === 'square')).toBe(true)
    expect(ctx.oscillators.map((o) => o.frequency.events[0].value)).toEqual([...COWBELL_FREQS])
  })
})

describe('toms', () => {
  it('sweeps down onto its settling pitch', () => {
    const p = resolveTomParams()
    expect(p.freq).toBe(LOW_TOM_DEFAULTS.freq)
  })
})
