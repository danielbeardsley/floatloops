import { usePatternStore } from '../state/patternStore'
import { useSettingsStore } from '../state/settingsStore'
import { getVoice } from '../audio/kit'
import { STEPS_PER_BEAT, STEPS_PER_MEASURE } from '../audio/timing'
import { GridGap } from './GridGap'
import type { StepWindow } from './visibleSteps'

/**
 * The drum half of the grid, folded away by the same header the piano roll
 * uses.
 *
 * Collapsing is only ever visual: the drums go on playing, which is why the
 * header says how many of them are in use rather than leaving a silent gap
 * where nine rows were.
 *
 * Only the steps in `shown` are drawn; the rest of the beat is held open by a
 * gap at either end. See visibleSteps.
 */
export function DrumRows({ steps, shown }: { steps: number; shown: StepWindow }) {
  const tracks = usePatternStore((s) => s.pattern.tracks)
  const drumsMuted = usePatternStore((s) => s.pattern.drumsMuted)
  const toggleMute = usePatternStore((s) => s.toggleMute)
  const toggleDrumsMute = usePatternStore((s) => s.toggleDrumsMute)
  const setTrackLevel = usePatternStore((s) => s.setTrackLevel)
  const open = useSettingsStore((s) => s.drumsOpen)
  const setDrumsOpen = useSettingsStore((s) => s.setDrumsOpen)

  const stepIndices = Array.from({ length: shown.to - shown.from }, (_, i) => shown.from + i)
  const inUse = tracks.filter((track) => track.steps.some((step) => step > 0)).length

  return (
    <>
      <div className="section-head">
        <div className="section-head__inner">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setDrumsOpen(!open)}
            aria-expanded={open}
          >
            <span className="section-toggle__caret" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            Drums
            {!open && inUse > 0 ? (
              <span className="section-toggle__count">{inUse}</span>
            ) : null}
          </button>

          {/* Shown folded or not, exactly as the melody's is: the drums keep
              playing when the section is collapsed, so the one control that
              stops them has to stay reachable. */}
          <span className="section-head__controls">
            <button
              type="button"
              className="row__mute"
              onClick={toggleDrumsMute}
              aria-pressed={drumsMuted}
              aria-label={`${drumsMuted ? 'Unmute' : 'Mute'} drums`}
            >
              M
            </button>
          </span>
        </div>
      </div>

      {open
        ? tracks.map((track, trackIndex) => {
            const voice = getVoice(track.voiceId)
            return [
              <div
                key={`${track.voiceId}-label`}
                className={`row__label${track.muted || drumsMuted ? ' row__label--muted' : ''}`}
                style={{ ['--track-color' as string]: voice.color }}
              >
                <span className="row__name">{voice.name}</span>
                <span className="row__controls">
                  <button
                    type="button"
                    className="row__mute"
                    onClick={() => toggleMute(trackIndex)}
                    aria-pressed={track.muted}
                    aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${voice.name}`}
                  >
                    M
                  </button>
                  <input
                    type="range"
                    className="row__level"
                    min={0}
                    max={1}
                    step={0.05}
                    value={track.level}
                    onChange={(e) => setTrackLevel(trackIndex, Number(e.target.value))}
                    aria-label={`${voice.name} volume`}
                  />
                </span>
              </div>,
              <GridGap key={`${track.voiceId}-before`} span={shown.from} />,
              ...stepIndices.map((stepIndex) => {
                const velocity = track.steps[stepIndex] ?? 0
                const classes = [
                  'cell',
                  velocity > 0 ? 'cell--on' : '',
                  stepIndex % STEPS_PER_BEAT === 0 ? 'cell--beat' : '',
                  stepIndex % STEPS_PER_MEASURE === 0 ? 'cell--bar' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <button
                    key={`${track.voiceId}-${stepIndex}`}
                    type="button"
                    className={classes}
                    data-track={trackIndex}
                    data-step={stepIndex}
                    style={{
                      ['--track-color' as string]: voice.color,
                      ['--velocity' as string]: velocity,
                    }}
                    aria-label={`${voice.name} step ${stepIndex + 1}`}
                    aria-pressed={velocity > 0}
                  />
                )
              }),
              <GridGap key={`${track.voiceId}-after`} span={steps - shown.to} />,
            ]
          })
        : null}
    </>
  )
}
