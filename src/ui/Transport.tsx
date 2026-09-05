import { useCallback, useRef, useState } from 'react'
import { usePatternStore } from '../state/patternStore'
import { useLibraryStore } from '../state/libraryStore'
import { togglePlay } from '../state/transport'
import { MAX_BPM, MIN_BPM } from '../audio/timing'

export function Transport() {
  const isPlaying = usePatternStore((s) => s.isPlaying)
  const bpm = usePatternStore((s) => s.pattern.bpm)
  const name = usePatternStore((s) => s.pattern.name)
  const setBpm = usePatternStore((s) => s.setBpm)
  const rename = usePatternStore((s) => s.rename)
  const setPattern = usePatternStore((s) => s.setPattern)
  const saveToLibrary = useLibraryStore((s) => s.save)

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const resetSaveLabel = useRef<number>(0)

  const onToggle = useCallback(() => {
    void togglePlay()
  }, [])

  const onSave = useCallback(async () => {
    setSaveState('saving')
    try {
      // Keep the saved copy, so pressing Save again updates in place rather
      // than leaving the sequencer holding a stale updatedAt.
      setPattern(await saveToLibrary(usePatternStore.getState().pattern))
      setSaveState('saved')
    } catch {
      setSaveState('failed')
    }

    window.clearTimeout(resetSaveLabel.current)
    resetSaveLabel.current = window.setTimeout(() => setSaveState('idle'), 1800)
  }, [saveToLibrary, setPattern])

  const saveLabel = { idle: 'Save', saving: 'Saving…', saved: 'Saved', failed: 'Failed' }[saveState]

  return (
    <div className="transport">
      <button
        type="button"
        className={`transport__play${isPlaying ? ' transport__play--on' : ''}`}
        onClick={onToggle}
        aria-pressed={isPlaying}
      >
        {isPlaying ? 'Stop' : 'Play'}
      </button>

      <input
        type="text"
        className="transport__name"
        value={name}
        onChange={(e) => rename(e.target.value)}
        aria-label="Beat name"
        maxLength={40}
      />

      <button
        type="button"
        className="transport__save"
        onClick={() => void onSave()}
        disabled={saveState === 'saving'}
      >
        {saveLabel}
      </button>

      <label className="transport__tempo">
        <span className="transport__tempo-label">Tempo</span>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
        />
        <output className="transport__bpm">{bpm} bpm</output>
      </label>
    </div>
  )
}
