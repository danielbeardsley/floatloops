import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Transport } from '../Transport'
import { usePatternStore } from '../../state/patternStore'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { demoPattern } from '../../state/schema'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

/** Lets the unlock() promise settle before assertions. */
async function settle() {
  await act(async () => {})
}

beforeEach(() => {
  // Fake timers keep the scheduler's interval from running loose in jsdom.
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
  usePatternStore.setState({ pattern: demoPattern(), isPlaying: false })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
})

describe('Transport', () => {
  it('offers to play before anything has started', () => {
    render(<Transport />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('unlocks audio on the first press of play', async () => {
    render(<Transport />)
    expect(mock.state).toBe('suspended')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()
    expect(mock.state).toBe('running')
  })

  it('starts the pattern and offers to stop', async () => {
    render(<Transport />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()

    expect(usePatternStore.getState().isPlaying).toBe(true)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    // The demo pattern is not silent, so the downbeat was scheduled.
    expect(mock.oscillators.length + mock.bufferSources.length).toBeGreaterThan(0)
  })

  it('stops again when pressed a second time', async () => {
    render(<Transport />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()

    expect(usePatternStore.getState().isPlaying).toBe(false)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('changes the tempo', () => {
    render(<Transport />)
    fireEvent.change(screen.getByLabelText(/tempo in beats/i), { target: { value: '150' } })
    expect(usePatternStore.getState().pattern.bpm).toBe(150)
    expect(screen.getByText('150 bpm')).toBeInTheDocument()
  })
})

