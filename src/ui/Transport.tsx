import { useCallback } from 'react'
import { usePatternStore } from '../state/patternStore'
import { togglePlay } from '../state/transport'
import { MAX_BPM, MIN_BPM } from '../audio/timing'

export function Transport() {
  const isPlaying = usePatternStore((s) => s.isPlaying)
  const bpm = usePatternStore((s) => s.pattern.bpm)
  const name = usePatternStore((s) => s.pattern.name)
  const setBpm = usePatternStore((s) => s.setBpm)

  const onToggle = useCallback(() => {
    void togglePlay()
  }, [])

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

      <span className="transport__name">{name}</span>

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
