import { create } from 'zustand'
import { loadPreferences, savePreferences, type Preferences } from './preferences'

export type SettingsStore = Preferences & {
  setAutoSave: (autoSave: boolean) => void
  setFollowPlayhead: (followPlayhead: boolean) => void
  setMelodyOpen: (melodyOpen: boolean) => void
  setDrumsOpen: (drumsOpen: boolean) => void
}

/** Writes the whole preference set, so one setting cannot drop another. */
function persist(state: SettingsStore, change: Partial<Preferences>): Preferences {
  const next: Preferences = {
    autoSave: state.autoSave,
    followPlayhead: state.followPlayhead,
    melodyOpen: state.melodyOpen,
    drumsOpen: state.drumsOpen,
    ...change,
  }
  savePreferences(next)
  return next
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  ...loadPreferences(),

  setAutoSave: (autoSave) => set((s) => persist(s, { autoSave })),
  setFollowPlayhead: (followPlayhead) => set((s) => persist(s, { followPlayhead })),
  setMelodyOpen: (melodyOpen) => set((s) => persist(s, { melodyOpen })),
  setDrumsOpen: (drumsOpen) => set((s) => persist(s, { drumsOpen })),
}))
