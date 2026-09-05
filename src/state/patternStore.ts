import { create } from 'zustand'
import * as edit from './schema'
import type { Pattern } from './schema'

/**
 * Zustand rather than context+reducer for one specific reason: the scheduler
 * needs to read the current pattern on every tick via getState(), without
 * subscribing to renders.
 */
export type PatternStore = {
  pattern: Pattern
  isPlaying: boolean

  setPattern: (pattern: Pattern) => void
  toggleStep: (trackIndex: number, stepIndex: number) => void
  setStep: (trackIndex: number, stepIndex: number, value: number) => void
  setBpm: (bpm: number) => void
  toggleMute: (trackIndex: number) => void
  setTrackLevel: (trackIndex: number, level: number) => void
  addMeasure: () => void
  rename: (name: string) => void
  setPlaying: (isPlaying: boolean) => void
}

export const usePatternStore = create<PatternStore>()((set) => ({
  pattern: edit.demoPattern(),
  isPlaying: false,

  setPattern: (pattern) => set({ pattern }),
  toggleStep: (trackIndex, stepIndex) =>
    set((s) => ({ pattern: edit.toggleStep(s.pattern, trackIndex, stepIndex) })),
  setStep: (trackIndex, stepIndex, value) =>
    set((s) => ({ pattern: edit.setStep(s.pattern, trackIndex, stepIndex, value) })),
  setBpm: (bpm) => set((s) => ({ pattern: edit.setPatternBpm(s.pattern, bpm) })),
  toggleMute: (trackIndex) => set((s) => ({ pattern: edit.toggleMute(s.pattern, trackIndex) })),
  setTrackLevel: (trackIndex, level) =>
    set((s) => ({ pattern: edit.setTrackLevel(s.pattern, trackIndex, level) })),
  addMeasure: () => set((s) => ({ pattern: edit.addMeasure(s.pattern) })),
  rename: (name) => set((s) => ({ pattern: edit.renamePattern(s.pattern, name) })),
  setPlaying: (isPlaying) => set({ isPlaying }),
}))
