import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MELODY_VOICE,
  MELODY_KIT,
  MELODY_VOICE_IDS,
  getMelodyVoice,
  isMelodyVoiceId,
} from '../melodyKit'
import { LEVEL_FLOOR } from '../voices/env'
import { bells } from '../voices/bells'
import { chorus, chorusEnvelopePoints } from '../voices/chorus'
import { deepBass, deepBassEnvelopePoints } from '../voices/deepBass'
import { fluteEnvelopePoints } from '../voices/flute'
import {
  MockAudioContext,
  MockAudioNode,
  MockAudioParam,
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

/** Whether a source drives someone else's parameter instead of the output. */
function modulates(from: MockAudioNode, seen = new Set<MockAudioNode>()): boolean {
  if (seen.has(from)) return false
  seen.add(from)
  return from.outputs.some((next) => next instanceof MockAudioParam || modulates(next, seen))
}

/**
 * The loudest thing scheduled on the way to the output. Gains that go
 * anywhere else are modulation depths, which have nothing to do with volume.
 */
function loudest(ctx: MockAudioContext): number {
  return Math.max(
    ...ctx.gains
      .filter((gain) => reaches(gain, ctx.destination))
      .flatMap((gain) => gain.gain.events.map((event) => event.value)),
  )
}

function endsAt(ctx: MockAudioContext): number {
  return Math.max(...allSources(ctx).map((source) => source.stoppedAt ?? 0))
}

describe('every melody voice', () => {
  const WHEN = 4

  for (const voice of MELODY_KIT) {
    describe(voice.name, () => {
      function trigger(opts = {}) {
        const ctx = new MockAudioContext()
        voice.trigger(asAudioContext(ctx), asAudioNode(ctx.destination), WHEN, {
          freq: 440,
          duration: 0.5,
          level: 0.5,
          ...opts,
        })
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

      it('outlives the note it was asked for, so nothing is cut off', () => {
        expect(endsAt(trigger({ duration: 0.5 }))).toBeGreaterThan(WHEN + 0.5)
      })

      it('reaches the destination, or modulates something that does', () => {
        const ctx = trigger()
        for (const source of allSources(ctx)) {
          expect(reaches(source, ctx.destination) || modulates(source)).toBe(true)
        }
      })

      // The one thing that separates these from the drum kit: the roll decides
      // how long a note is, so a long one has to last longer than a short one.
      it('holds a long note for longer than a short one', () => {
        expect(endsAt(trigger({ duration: 1.5 }))).toBeGreaterThan(
          endsAt(trigger({ duration: 0.1 })),
        )
      })

      // Which octave is the voice's own business -- the lead puts a sub below
      // the note, the bells ring above it -- but it plays the note it was
      // handed, not some other one.
      it('plays the pitch it was given, in one octave or another', () => {
        const played = trigger({ freq: 330 }).oscillators.map((osc) => osc.frequency.value)
        const octaves = [0.25, 0.5, 1, 2, 4].map((ratio) => 330 * ratio)
        expect(played.some((freq) => octaves.includes(freq))).toBe(true)
      })

      it('is louder when asked for a louder note', () => {
        expect(loudest(trigger({ level: 0.8 }))).toBeGreaterThan(loudest(trigger({ level: 0.2 })))
      })

      it('never exponentially ramps a gain to zero', () => {
        for (const gain of trigger().gains) {
          for (const event of gain.gain.events) {
            if (event.method === 'exponentialRampToValueAtTime') {
              expect(event.value).toBeGreaterThanOrEqual(LEVEL_FLOOR)
            }
          }
        }
      })

      it('schedules every gain event in increasing time order', () => {
        for (const gain of trigger().gains) {
          const times = gain.gain.events.map((event) => event.time)
          for (let i = 1; i < times.length; i += 1) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
          }
        }
      })

      it('survives nonsense without throwing', () => {
        expect(() => trigger({ level: Number.NaN, duration: -10, freq: 0 })).not.toThrow()
        expect(() => trigger({ level: 99, duration: 999, freq: 1e9 })).not.toThrow()
      })
    })
  }
})

describe('bells', () => {
  it('rings an octave above the note it was given, where a bell sounds like one', () => {
    const ctx = new MockAudioContext()
    bells(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220 })

    expect(ctx.oscillators[0].frequency.value).toBe(440)
    // The partial is inharmonic, and moves with the fundamental.
    expect(ctx.oscillators[1].frequency.value).toBeCloseTo(440 * 2.76)
  })
})

describe('chorus', () => {
  const WHEN = 2
  const HELD = 1
  const points = chorusEnvelopePoints(WHEN, 0.5, HELD)

  it('builds slowly -- more slowly than any other voice here', () => {
    const built = points[1].time - WHEN
    const flute = fluteEnvelopePoints(WHEN, 0.5, HELD)[1].time - WHEN

    expect(built).toBeGreaterThan(flute)
  })

  it('holds full level until the note is let go of', () => {
    expect(points[2].time).toBe(WHEN + HELD)
    expect(points[2].value).toBe(points[1].value)
  })

  it('takes the best part of a second to go, without eating into the note', () => {
    const fell = points[3].time - (WHEN + HELD)
    expect(fell).toBeGreaterThan(0.5)
    expect(fell).toBeLessThan(1.5)
  })

  it('detunes two voices around one that is dead in tune', () => {
    const ctx = new MockAudioContext()
    chorus(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 440 })

    const [middle, up, down, sub] = ctx.oscillators.map((osc) => osc.frequency.value)
    expect(middle).toBe(440)
    expect(up).toBeGreaterThan(440)
    expect(down).toBeLessThan(440)
    // Cents apart, not a different note: a tenth of a semitone at the very
    // most, or the three would be heard as a chord rather than as one note.
    const tenthOfASemitone = Math.pow(2, 10 / 1200)
    expect(up / 440).toBeLessThan(tenthOfASemitone)
    expect(440 / down).toBeLessThan(tenthOfASemitone)

    // The fourth voice is the octave underneath, which is a different matter.
    expect(sub).toBe(220)
  })

  it('is fuller than one oscillator: four voices, most of them sawtooths', () => {
    const ctx = new MockAudioContext()
    chorus(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 440 })

    const types = ctx.oscillators.map((osc) => osc.type)
    expect(types.filter((type) => type === 'sawtooth')).toHaveLength(3)
    // The octave below, and the drift that moves the detuned pair.
    expect(types.filter((type) => type === 'triangle')).toHaveLength(1)
    expect(types.filter((type) => type === 'sine')).toHaveLength(1)
  })
})

describe('deep bass', () => {
  const WHEN = 3
  const HELD = 1

  /** The one that sweeps. The other filter is the floor under the sawtooths. */
  function lowpassOf(ctx: MockAudioContext) {
    return ctx.filters.find((filter) => filter.type === 'lowpass')!
  }

  it('plays an octave below what the roll says, where a bassline lives', () => {
    const ctx = new MockAudioContext()
    deepBass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220 })

    // The roll's lowest note is a C3; a bass drawn along the bottom of it has
    // to come out lower than that to be a bass at all.
    for (const osc of ctx.oscillators) {
      expect(osc.frequency.value).toBeLessThan(220)
      expect(osc.frequency.value).toBeGreaterThan(100)
    }
  })

  it('puts a sine on the note itself, with the sawtooths either side of it', () => {
    const ctx = new MockAudioContext()
    deepBass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220 })

    const sines = ctx.oscillators.filter((osc) => osc.type === 'sine')
    const saws = ctx.oscillators.filter((osc) => osc.type === 'sawtooth')
    expect(sines).toHaveLength(1)
    expect(sines[0].frequency.value).toBe(110)
    expect(saws).toHaveLength(2)

    // Cents apart, so the pair beats against itself rather than sounding as a
    // chord underneath the note.
    const tenthOfASemitone = Math.pow(2, 10 / 1200)
    const [up, down] = saws.map((osc) => osc.frequency.value).sort((a, b) => b - a)
    expect(up / 110).toBeLessThan(tenthOfASemitone)
    expect(110 / down).toBeLessThan(tenthOfASemitone)
  })

  // The weight of the voice. Sending it through the filters with everything
  // else would trade the depth away to get the movement.
  it('keeps the sine out of the filters, and the sawtooths in them', () => {
    const ctx = new MockAudioContext()
    deepBass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220 })

    for (const osc of ctx.oscillators) {
      const filtered = ctx.filters.some((filter) => reaches(osc, filter))
      expect(filtered).toBe(osc.type === 'sawtooth')
      expect(reaches(osc, ctx.destination)).toBe(true)
    }
  })

  // Otherwise the sawtooths double the sine down where it lives, and two
  // things at the bottom is what makes a bass muddy rather than deep.
  it('trims the sawtooths off below the note the roll was given', () => {
    const ctx = new MockAudioContext()
    deepBass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220 })

    const floor = ctx.filters.find((filter) => filter.type === 'highpass')!
    expect(floor.frequency.events[0].value).toBeGreaterThanOrEqual(110)
  })

  it('closes the filter down towards the note, so it is not a held buzz', () => {
    const ctx = new MockAudioContext()
    deepBass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220, duration: 1 })

    const [opened, closed] = lowpassOf(ctx).frequency.events
    expect(opened.value).toBeGreaterThan(closed.value)
    // Above the note it is playing, or the note itself would be filtered out.
    expect(closed.value).toBeGreaterThan(110)
    expect(closed.time).toBeGreaterThan(opened.time)
  })

  // However long the note, the sweep is the same: a long note settles and
  // stays settled rather than sagging all the way through.
  it('closes over the same time whether the note is long or short', () => {
    function sweep(duration: number): number {
      const ctx = new MockAudioContext()
      deepBass(asAudioContext(ctx), asAudioNode(ctx.destination), 0, { freq: 220, duration })
      const [opened, closed] = lowpassOf(ctx).frequency.events
      return closed.time - opened.time
    }

    expect(sweep(4)).toBeCloseTo(sweep(1))
    // Except when the note is shorter than the sweep, which still gets to close.
    expect(sweep(0.05)).toBeLessThan(sweep(1))
  })

  it('lets go of the note promptly, so one bass note does not run into the next', () => {
    const points = deepBassEnvelopePoints(WHEN, 0.5, HELD)
    const chorusPoints = chorusEnvelopePoints(WHEN, 0.5, HELD)

    expect(points[2].time).toBe(WHEN + HELD)
    const fell = points[3].time - (WHEN + HELD)
    expect(fell).toBeLessThan(chorusPoints[3].time - (WHEN + HELD))
    expect(fell).toBeGreaterThan(0)
  })
})

describe('the melody kit', () => {
  it('offers the lead plus five more', () => {
    expect(MELODY_KIT).toHaveLength(6)
  })

  it('gives every voice a unique id and a name', () => {
    expect(new Set(MELODY_VOICE_IDS).size).toBe(MELODY_KIT.length)
    for (const voice of MELODY_KIT) expect(voice.name.length).toBeGreaterThan(0)
  })

  // Every beat written before there was a choice is played with the lead, so
  // it stays the default and stays first in the picker.
  it('leads with the lead', () => {
    expect(MELODY_KIT[0].id).toBe('lead')
    expect(DEFAULT_MELODY_VOICE).toBe('lead')
  })

  it('looks voices up by id', () => {
    expect(getMelodyVoice('bells').name).toBe('Bells')
  })

  // Unlike the drum kit's lookup: the id comes out of a saved beat, and the
  // wrong sound beats a beat that will not open.
  it('falls back to the lead rather than throwing on an unknown id', () => {
    // @ts-expect-error deliberately invalid
    expect(getMelodyVoice('theremin').id).toBe('lead')
  })

  it('knows which ids are real, so a save can be checked', () => {
    expect(isMelodyVoiceId('flute')).toBe(true)
    expect(isMelodyVoiceId('theremin')).toBe(false)
    expect(isMelodyVoiceId(3)).toBe(false)
    expect(isMelodyVoiceId(undefined)).toBe(false)
  })
})
