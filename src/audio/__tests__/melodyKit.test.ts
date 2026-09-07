import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MELODY_VOICE,
  MELODY_KIT,
  MELODY_VOICE_IDS,
  getMelodyVoice,
  isMelodyVoiceId,
} from '../melodyKit'
import { LEVEL_FLOOR } from '../voices/env'
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

      it('plays the pitch it was given', () => {
        const played = trigger({ freq: 330 }).oscillators.map((osc) => osc.frequency.value)
        expect(played.some((freq) => freq === 330 || freq === 165)).toBe(true)
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

describe('the melody kit', () => {
  it('offers the lead plus three more', () => {
    expect(MELODY_KIT).toHaveLength(4)
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
