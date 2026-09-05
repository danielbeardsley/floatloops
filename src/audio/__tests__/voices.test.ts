import { describe, expect, it } from 'vitest'
import { KIT } from '../kit'
import { CLOSED_HAT_DEFAULTS, OPEN_HAT_DEFAULTS, resolveHatParams } from '../voices/hat'
import { clapDuration, clapEnvelopePoints, resolveClapParams } from '../voices/clap'
import { resolveSnareParams, snare } from '../voices/snare'
import { LOW_TOM_DEFAULTS, resolveTomParams } from '../voices/tom'
import { LEVEL_FLOOR } from '../voices/env'
import { bass } from '../voices/bass'
import { STAB_INTERVALS, stab } from '../voices/stab'
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

describe('toms', () => {
  it('sweeps down onto its settling pitch', () => {
    const p = resolveTomParams()
    expect(p.freq).toBe(LOW_TOM_DEFAULTS.freq)
  })
})

describe('bass', () => {
  function pluck(opts = {}) {
    const ctx = new MockAudioContext()
    bass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, opts)
    return ctx
  }

  it('is a sawtooth, which is what gives it harmonics to filter', () => {
    expect(pluck().oscillators[0].type).toBe('sawtooth')
  })

  it('closes the filter as the note decays', () => {
    const events = pluck().filters[0].frequency.events
    expect(events.at(-1)!.value).toBeLessThan(events[0].value)
  })

  it('opens the filter relative to the pitch, so every note is equally bright', () => {
    const low = pluck({ freq: 40 }).filters[0].frequency.events[0].value
    const high = pluck({ freq: 80 }).filters[0].frequency.events[0].value
    expect(high).toBeCloseTo(low * 2)
  })

  it('stays clear of the Nyquist limit however bright it is asked to be', () => {
    const events = pluck({ freq: 600, brightness: 40 }).filters[0].frequency.events
    expect(events[0].value).toBeLessThanOrEqual(16000)
  })
})

describe('stab', () => {
  function hit(opts = {}) {
    const ctx = new MockAudioContext()
    stab(asAudioContext(ctx), asAudioNode(ctx.destination), 0, opts)
    return ctx
  }

  it('stacks a triad', () => {
    expect(hit().oscillators).toHaveLength(STAB_INTERVALS.length)
  })

  it('detunes them, so three saws do not sound like one loud saw', () => {
    const pitches = hit().oscillators.map((o) => o.frequency.events[0].value)
    expect(new Set(pitches).size).toBe(pitches.length)
  })

  it('spaces them as a minor triad above the root', () => {
    const [root, third, fifth] = hit({ freq: 200 }).oscillators.map(
      (o) => o.frequency.events[0].value,
    )
    expect(root).toBeCloseTo(200, 0)
    expect(third / root).toBeCloseTo(STAB_INTERVALS[1], 1)
    expect(fifth / root).toBeCloseTo(STAB_INTERVALS[2], 1)
  })

  it('runs the whole chord through one filter', () => {
    const ctx = hit()
    expect(ctx.filters).toHaveLength(1)
    for (const osc of ctx.oscillators) {
      expect(osc.outputs).toContain(ctx.filters[0])
    }
  })
})

