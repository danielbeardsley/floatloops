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
  /**
   * A pattern being auditioned from the library. While set, the sequencer
   * plays this instead of `pattern`, so previewing never disturbs the beat
   * currently open in the sequencer.
   */
  preview: Pattern | null
  isPlaying: boolean

  setPattern: (pattern: Pattern) => void
  setPreview: (preview: Pattern | null) => void
  toggleStep: (trackIndex: number, stepIndex: number) => void
  setStep: (trackIndex: number, stepIndex: number, value: number) => void
  setBpm: (bpm: number) => void
  toggleMute: (trackIndex: number) => void
  toggleDrumsMute: () => void
  setTrackLevel: (trackIndex: number, level: number) => void
  addMeasure: () => void
  removeMeasure: (measureIndex: number) => void
  addNote: (draft: edit.NoteDraft) => void
  updateNote: (id: string, draft: edit.NoteDraft) => void
  removeNote: (id: string) => void
  setMelodyLevel: (level: number) => void
  toggleMelodyMute: () => void
  rename: (name: string) => void
  setPlaying: (isPlaying: boolean) => void
}

export const usePatternStore = create<PatternStore>()((set) => ({
  pattern: edit.demoPattern(),
  preview: null,
  isPlaying: false,

  setPattern: (pattern) => set({ pattern }),
  setPreview: (preview) => set({ preview }),
  toggleStep: (trackIndex, stepIndex) =>
    set((s) => ({ pattern: edit.toggleStep(s.pattern, trackIndex, stepIndex) })),
  setStep: (trackIndex, stepIndex, value) =>
    set((s) => ({ pattern: edit.setStep(s.pattern, trackIndex, stepIndex, value) })),
  setBpm: (bpm) => set((s) => ({ pattern: edit.setPatternBpm(s.pattern, bpm) })),
  toggleMute: (trackIndex) => set((s) => ({ pattern: edit.toggleMute(s.pattern, trackIndex) })),
  toggleDrumsMute: () => set((s) => ({ pattern: edit.toggleDrumsMute(s.pattern) })),
  setTrackLevel: (trackIndex, level) =>
    set((s) => ({ pattern: edit.setTrackLevel(s.pattern, trackIndex, level) })),
  addMeasure: () => set((s) => ({ pattern: edit.addMeasure(s.pattern) })),
  removeMeasure: (measureIndex) =>
    set((s) => ({ pattern: edit.removeMeasure(s.pattern, measureIndex) })),
  addNote: (draft) => set((s) => ({ pattern: edit.addNote(s.pattern, draft) })),
  updateNote: (id, draft) => set((s) => ({ pattern: edit.updateNote(s.pattern, id, draft) })),
  removeNote: (id) => set((s) => ({ pattern: edit.removeNote(s.pattern, id) })),
  setMelodyLevel: (level) => set((s) => ({ pattern: edit.setMelodyLevel(s.pattern, level) })),
  toggleMelodyMute: () => set((s) => ({ pattern: edit.toggleMelodyMute(s.pattern) })),
  rename: (name) => set((s) => ({ pattern: edit.renamePattern(s.pattern, name) })),
  setPlaying: (isPlaying) => set({ isPlaying }),
}))
