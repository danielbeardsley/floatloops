import { describe, expect, it } from 'vitest'
import { KICK_DEFAULTS, LEVEL_FLOOR, kick, resolveKickParams } from '../voices/kick'
import { MockAudioContext, asAudioContext, asAudioNode } from '../../test/mockAudioContext'

describe('resolveKickParams', () => {
  it('uses the defaults when given nothing', () => {
    expect(resolveKickParams()).toEqual(KICK_DEFAULTS)
  })

  it('clamps level into 0..1', () => {
    expect(resolveKickParams({ level: 4 }).level).toBe(1)
    expect(resolveKickParams({ level: -2 }).level).toBe(0)
  })

  it('keeps the body pitch below the click pitch', () => {
    const p = resolveKickParams({ startFreq: 100, endFreq: 500 })
    expect(p.endFreq).toBeLessThanOrEqual(p.startFreq)
  })

  it('never allows a zero-length decay', () => {
    expect(resolveKickParams({ decay: 0 }).decay).toBeGreaterThan(0)
  })

  it('falls back to defaults for garbage input', () => {
    expect(resolveKickParams({ decay: Number.NaN }).decay).toBe(KICK_DEFAULTS.decay)
  })
})

describe('kick', () => {
  function trigger(when = 5, opts = {}) {
    const ctx = new MockAudioContext()
    const dest = asAudioNode(ctx.destination)
    kick(asAudioContext(ctx), dest, when, opts)
    return { ctx, osc: ctx.oscillators[0], amp: ctx.gains[0] }
  }

  it('builds one oscillator through one gain into the destination', () => {
    const { ctx, osc, amp } = trigger()
    expect(ctx.oscillators).toHaveLength(1)
    expect(ctx.gains).toHaveLength(1)
    expect(osc.outputs).toEqual([amp])
    expect(amp.outputs).toEqual([ctx.destination])
  })

  it('starts exactly at the requested time, not "now"', () => {
    const { osc } = trigger(12.5)
    expect(osc.startedAt).toBe(12.5)
  })

  it('stops after the decay has run out', () => {
    const { osc } = trigger(5, { decay: 0.4 })
    expect(osc.stoppedAt).toBeGreaterThan(5.4)
  })

  it('sweeps the pitch downward', () => {
    const { osc } = trigger(0, { startFreq: 150, endFreq: 45 })
    expect(osc.frequency.events[0]).toMatchObject({ value: 150, time: 0 })
    const sweep = osc.frequency.events.at(-1)!
    expect(sweep.method).toBe('exponentialRampToValueAtTime')
    expect(sweep.value).toBe(45)
  })

  it('fades in before decaying, so the attack does not click', () => {
    const { amp } = trigger(0)
    const [start, attack] = amp.gain.events
    expect(start).toMatchObject({ value: 0, time: 0 })
    expect(attack.method).toBe('linearRampToValueAtTime')
    expect(attack.time).toBeGreaterThan(0)
  })

  it('never exponentially ramps gain to zero, which Web Audio forbids', () => {
    const { amp } = trigger(0)
    for (const event of amp.gain.events) {
      if (event.method === 'exponentialRampToValueAtTime') {
        expect(event.value).toBeGreaterThan(0)
        expect(event.value).toBe(LEVEL_FLOOR)
      }
    }
  })

  it('disconnects its nodes once the sound has finished', () => {
    const { osc, amp } = trigger()
    expect(osc.disconnected).toBe(false)
    osc.finish()
    expect(osc.disconnected).toBe(true)
    expect(amp.disconnected).toBe(true)
  })
})
