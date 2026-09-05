import { create } from 'zustand'
import { loadPreferences, savePreferences, type Preferences } from './preferences'

export type SettingsStore = Preferences & {
  setFollowPlayhead: (followPlayhead: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  ...loadPreferences(),

  setFollowPlayhead: (followPlayhead) => {
    savePreferences({ followPlayhead })
    set({ followPlayhead })
  },
}))
