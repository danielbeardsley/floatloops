import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { engineState, getEngine, hasEngine, resetEngine, setContextFactory, unlock } from '../context'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

beforeEach(() => {
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
})

afterEach(() => {
  resetEngine()
  delete (navigator as Navigator).audioSession
})

describe('getEngine', () => {
  it('does not create a context until it is asked for one', () => {
    expect(hasEngine()).toBe(false)
    expect(engineState()).toBe('uninitialised')
  })

  it('returns the same engine every time', () => {
    expect(getEngine()).toBe(getEngine())
    expect(mock.compressors).toHaveLength(1)
  })

  it('routes master through a compressor into the destination', () => {
    const { master } = getEngine()
    const compressor = mock.compressors[0]
    expect((master as unknown as { outputs: unknown[] }).outputs).toEqual([compressor])
    expect(compressor.outputs).toEqual([mock.destination])
  })
})

describe('unlock', () => {
  it('resumes a suspended context', async () => {
    expect(mock.state).toBe('suspended')
    await expect(unlock()).resolves.toBe('running')
  })

  it('asks iOS for a playback session so the silent switch cannot mute us', async () => {
    ;(navigator as Navigator).audioSession = { type: 'auto' }
    await unlock()
    expect(navigator.audioSession?.type).toBe('playback')
  })

  it('is safe to call when already running', async () => {
    await unlock()
    await expect(unlock()).resolves.toBe('running')
  })
})
