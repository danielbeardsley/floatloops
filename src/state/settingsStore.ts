import { create } from 'zustand'
import { loadPreferences, savePreferences, type Preferences } from './preferences'

export type SettingsStore = Preferences & {
  setFollowPlayhead: (followPlayhead: boolean) => void
  setMelodyOpen: (melodyOpen: boolean) => void
}

/** Writes the whole preference set, so one setting cannot drop another. */
function persist(state: SettingsStore, change: Partial<Preferences>): Preferences {
  const next: Preferences = {
    followPlayhead: state.followPlayhead,
    melodyOpen: state.melodyOpen,
    ...change,
  }
  savePreferences(next)
  return next
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  ...loadPreferences(),

  setFollowPlayhead: (followPlayhead) => set((s) => persist(s, { followPlayhead })),
  setMelodyOpen: (melodyOpen) => set((s) => persist(s, { melodyOpen })),
}))
