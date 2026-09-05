import { useCallback, useRef } from 'react'
import { usePatternStore } from '../state/patternStore'
import {
  canAddMeasure,
  canRemoveMeasure,
  isStepOn,
  measureHasHits,
  totalSteps,
} from '../state/schema'
import { STEPS_PER_BEAT, STEPS_PER_MEASURE } from '../audio/timing'
import { getVoice } from '../audio/kit'
import { audition } from '../audio/audition'
import { useSettingsStore } from '../state/settingsStore'
import { planFollow } from './followPlayhead'
import { usePlayhead } from './usePlayhead'
import { useStepPainter, type StepTarget } from './useStepPainter'

/** Width of the sticky track column. Keep in step with --label-w in app.css. */
const LABEL_WIDTH = 150

export function Grid() {
  const scroller = useRef<HTMLDivElement>(null)
  const painting = useRef(false)
  const shownMeasure = useRef<number | null>(null)

  const pattern = usePatternStore((s) => s.pattern)
  const isPlaying = usePatternStore((s) => s.isPlaying)
  const toggleMute = usePatternStore((s) => s.toggleMute)
  const setTrackLevel = usePatternStore((s) => s.setTrackLevel)
  const addMeasure = usePatternStore((s) => s.addMeasure)
  const followPlayhead = useSettingsStore((s) => s.followPlayhead)
  const setFollowPlayhead = useSettingsStore((s) => s.setFollowPlayhead)

  const steps = totalSteps(pattern)

  // Reading through getState keeps these callbacks stable, so the painter is
  // not rebuilt on every edit.
  const isOn = useCallback(({ trackIndex, stepIndex }: StepTarget) => {
    const track = usePatternStore.getState().pattern.tracks[trackIndex]
    return track ? isStepOn(track, stepIndex) : false
  }, [])

  const onPaint = useCallback((target: StepTarget, value: number) => {
    const store = usePatternStore.getState()
    const track = store.pattern.tracks[target.trackIndex]
    if (!track) return

    store.setStep(target.trackIndex, target.stepIndex, value)
    // Hearing the drum as you draw it is how you learn which row is which.
    if (value > 0 && !track.muted) void audition(track.voiceId, track.level)
  }, [])

  const painter = useStepPainter({
    container: scroller,
    isOn,
    onPaint,
    onPaintStart: () => {
      painting.current = true
    },
    onPaintEnd: () => {
      painting.current = false
    },
  })

  const scrollToMeasure = useCallback((measure: number) => {
    const root = scroller.current
    const marker = root?.querySelector<HTMLElement>(`[data-measure="${measure}"]`)
    if (!root || !marker) return

    const offset = marker.getBoundingClientRect().left - root.getBoundingClientRect().left
    root.scrollTo({ left: root.scrollLeft + offset - LABEL_WIDTH, behavior: 'smooth' })
  }, [])

  usePlayhead(scroller, isPlaying, {
    onStep: (step) => {
      // Read through getState so toggling the preference does not re-render
      // the whole grid.
      const plan = planFollow(
        { step, painting: painting.current, follow: useSettingsStore.getState().followPlayhead },
        shownMeasure.current,
      )

      shownMeasure.current = plan.shownMeasure
      if (plan.scrollTo !== null) scrollToMeasure(plan.scrollTo)
    },
  })

  const onRemoveMeasure = useCallback((measureIndex: number) => {
    const store = usePatternStore.getState()
    // Only ask when there is something to lose.
    if (
      measureHasHits(store.pattern, measureIndex) &&
      !window.confirm(`Remove measure ${measureIndex + 1}? Anything in it will be lost.`)
    ) {
      return
    }

    store.removeMeasure(measureIndex)
    // The measure under the playhead has moved; let it re-follow.
    shownMeasure.current = null
  }, [])

  const measures = Array.from({ length: pattern.measures }, (_, i) => i)
  const stepIndices = Array.from({ length: steps }, (_, i) => i)

  return (
    // The paint handlers sit on the same element that takes pointer capture:
    // once captured, events stop reaching descendants, so handlers on an inner
    // node would never fire again after the gesture started.
    <div className="grid" ref={scroller} data-testid="grid" {...painter}>
      <div className="grid__content" style={{ ['--steps' as string]: steps }}>
        <div className="grid__corner">
          <button
            type="button"
            className={`follow${followPlayhead ? ' follow--on' : ''}`}
            onClick={() => setFollowPlayhead(!followPlayhead)}
            aria-pressed={followPlayhead}
            title="Scroll the grid to keep up with the beat"
          >
            Follow
          </button>
        </div>
        {measures.map((measure) => (
          <div key={measure} className="ruler__measure" data-measure={measure}>
            <button
              type="button"
              className="ruler__jump"
              onClick={() => scrollToMeasure(measure)}
              aria-label={`Go to measure ${measure + 1}`}
            >
              {measure + 1}
            </button>
            {canRemoveMeasure(pattern) ? (
              <button
                type="button"
                className="ruler__remove"
                onClick={() => onRemoveMeasure(measure)}
                aria-label={`Remove measure ${measure + 1}`}
                title={`Remove measure ${measure + 1}`}
              >
                &times;
              </button>
            ) : null}
          </div>
        ))}

        {pattern.tracks.map((track, trackIndex) => {
          const voice = getVoice(track.voiceId)
          return [
            <div
              key={`${track.voiceId}-label`}
              className={`row__label${track.muted ? ' row__label--muted' : ''}`}
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
          ]
        })}
      </div>

      <button
        type="button"
        className="grid__add"
        onClick={addMeasure}
        disabled={!canAddMeasure(pattern)}
        aria-label="Add a measure"
        title="Add a measure"
      >
        +
      </button>
    </div>
  )
}
