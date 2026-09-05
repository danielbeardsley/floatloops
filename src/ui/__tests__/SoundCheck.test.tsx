import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SoundCheck } from '../SoundCheck'
import { resetEngine, setContextFactory } from '../../audio/context'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

beforeEach(() => {
  resetEngine()
  mock = new MockAudioContext()
  mock.currentTime = 3
  setContextFactory(() => asAudioContext(mock))
})

afterEach(() => {
  resetEngine()
})

describe('SoundCheck', () => {
  it('creates no audio context before the user touches anything', () => {
    render(<SoundCheck />)
    expect(screen.getByTestId('engine-status')).toHaveTextContent('uninitialised')
    expect(mock.oscillators).toHaveLength(0)
  })

  it('unlocks the context on the first tap and reports it', async () => {
    render(<SoundCheck />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /kick/i }))
    await waitFor(() => {
      expect(screen.getByTestId('engine-status')).toHaveTextContent('running')
    })
  })

  it('plays one kick per pad tap', async () => {
    render(<SoundCheck />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /kick/i }))
    await waitFor(() => expect(mock.oscillators).toHaveLength(1))
    expect(screen.getByTestId('hit-count')).toHaveTextContent('1')
  })

  it('schedules the pad hit slightly ahead, never in the past', async () => {
    render(<SoundCheck />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /kick/i }))
    await waitFor(() => expect(mock.oscillators).toHaveLength(1))
    expect(mock.oscillators[0].startedAt).toBeGreaterThan(mock.currentTime)
  })

  it('schedules four evenly spaced beats at once', async () => {
    render(<SoundCheck />)
    fireEvent.click(screen.getByRole('button', { name: /play 4 beats/i }))
    await waitFor(() => expect(mock.oscillators).toHaveLength(4))

    const times = mock.oscillators.map((osc) => osc.startedAt!)
    // Half a second between quarter notes at 120bpm.
    expect(times[1] - times[0]).toBeCloseTo(0.5)
    expect(times[2] - times[1]).toBeCloseTo(0.5)
    expect(times[3] - times[2]).toBeCloseTo(0.5)
  })

  it('routes drums through the master bus, not straight to the destination', async () => {
    render(<SoundCheck />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /kick/i }))
    await waitFor(() => expect(mock.oscillators).toHaveLength(1))

    // gains[0] is the engine master, built before any voice gain.
    const master = mock.gains[0]
    const voiceAmp = mock.gains[1]
    expect(voiceAmp.outputs).toContain(master)
  })
})
