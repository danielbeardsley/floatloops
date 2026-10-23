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

  it('waits for the Save button by default', () => {
    expect(DEFAULT_PREFERENCES.autoSave).toBe(false)
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

  it('forgets a melody view this build does not have', () => {
    window.localStorage.setItem('floatloops:preferences', '{"melodyView":"dorian"}')
    expect(loadPreferences().melodyView).toBe('pentatonic')
  })

  it('forgets a key that is not one of the twelve', () => {
    window.localStorage.setItem('floatloops:preferences', '{"melodyKey":13}')
    expect(loadPreferences().melodyKey).toBe(0)
  })

  it('reads back a melody view it does have', () => {
    window.localStorage.setItem('floatloops:preferences', '{"melodyView":"chromatic","melodyKey":7}')
    expect(loadPreferences().melodyView).toBe('chromatic')
    expect(loadPreferences().melodyKey).toBe(7)
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

  it('opens the piano roll to begin with, like the drums', () => {
    expect(DEFAULT_PREFERENCES.melodyOpen).toBe(true)
  })

  it('opens on the rows that cannot clash, in C', () => {
    expect(DEFAULT_PREFERENCES.melodyView).toBe('pentatonic')
    expect(DEFAULT_PREFERENCES.melodyKey).toBe(0)
    expect(DEFAULT_PREFERENCES.melodyNarrow).toBe(false)
  })

  it('remembers the rows the roll was left showing', () => {
    useSettingsStore.getState().setMelodyView('scale')
    useSettingsStore.getState().setMelodyKey(7)
    useSettingsStore.getState().setMelodyNarrow(true)

    const reloaded = loadPreferences()
    expect(reloaded.melodyView).toBe('scale')
    expect(reloaded.melodyKey).toBe(7)
    expect(reloaded.melodyNarrow).toBe(true)
  })

  it('does not drop one preference when writing another', () => {
    useSettingsStore.getState().setMelodyOpen(true)
    useSettingsStore.getState().setFollowPlayhead(false)

    const reloaded = loadPreferences()
    expect(reloaded.melodyOpen).toBe(true)
    expect(reloaded.followPlayhead).toBe(false)
  })
})
