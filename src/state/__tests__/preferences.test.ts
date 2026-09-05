import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../preferences'
import { useSettingsStore } from '../settingsStore'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadPreferences', () => {
  it('follows the playhead by default', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES)
    expect(DEFAULT_PREFERENCES.followPlayhead).toBe(true)
  })

  it('reads back what was saved', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, followPlayhead: false })
    expect(loadPreferences().followPlayhead).toBe(false)
  })

  it('falls back to defaults when the stored value is not JSON', () => {
    window.localStorage.setItem('floatloops:preferences', 'not json')
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('falls back to defaults for a field of the wrong type', () => {
    window.localStorage.setItem('floatloops:preferences', '{"followPlayhead":"yes"}')
    expect(loadPreferences().followPlayhead).toBe(true)
  })

  it('survives storage that refuses to be read', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('savePreferences', () => {
  it('survives storage that refuses to be written', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => savePreferences({ ...DEFAULT_PREFERENCES, followPlayhead: false })).not.toThrow()
  })
})

describe('settings store', () => {
  it('remembers the choice across a reload', () => {
    useSettingsStore.getState().setFollowPlayhead(false)
    expect(useSettingsStore.getState().followPlayhead).toBe(false)
    // What a fresh boot would read.
    expect(loadPreferences().followPlayhead).toBe(false)
  })

  it('keeps the piano roll closed until asked', () => {
    expect(DEFAULT_PREFERENCES.melodyOpen).toBe(false)
  })

  it('does not drop one preference when writing another', () => {
    useSettingsStore.getState().setMelodyOpen(true)
    useSettingsStore.getState().setFollowPlayhead(false)

    const reloaded = loadPreferences()
    expect(reloaded.melodyOpen).toBe(true)
    expect(reloaded.followPlayhead).toBe(false)
  })
})
