import { create } from 'zustand'
import { loadPreferences, savePreferences, type Preferences } from './preferences'
import type { MelodyView } from './melodyView'

export type SettingsStore = Preferences & {
  setAutoSave: (autoSave: boolean) => void
  setFollowPlayhead: (followPlayhead: boolean) => void
  setMelodyOpen: (melodyOpen: boolean) => void
  setDrumsOpen: (drumsOpen: boolean) => void
  setShowOthers: (showOthers: boolean) => void
  setMelodyView: (melodyView: MelodyView) => void
  setMelodyKey: (melodyKey: number) => void
  setMelodyNarrow: (melodyNarrow: boolean) => void
}

/** Writes the whole preference set, so one setting cannot drop another. */
function persist(state: SettingsStore, change: Partial<Preferences>): Preferences {
  const next: Preferences = {
    autoSave: state.autoSave,
    followPlayhead: state.followPlayhead,
    melodyOpen: state.melodyOpen,
    drumsOpen: state.drumsOpen,
    showOthers: state.showOthers,
    melodyView: state.melodyView,
    melodyKey: state.melodyKey,
    melodyNarrow: state.melodyNarrow,
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
  setShowOthers: (showOthers) => set((s) => persist(s, { showOthers })),
  setMelodyView: (melodyView) => set((s) => persist(s, { melodyView })),
  setMelodyKey: (melodyKey) => set((s) => persist(s, { melodyKey })),
  setMelodyNarrow: (melodyNarrow) => set((s) => persist(s, { melodyNarrow })),
}))
