import { usePatternStore } from '../state/patternStore'
import { useSettingsStore } from '../state/settingsStore'
import { PITCHES_TOP_DOWN, pitchName } from '../audio/scale'
import { MELODY_KIT, type MelodyVoiceId } from '../audio/melodyKit'
import { STEPS_PER_BEAT, STEPS_PER_MEASURE } from '../audio/timing'
import { bridgesGap, cellFill, pitchColor } from './melodyCells'
import type { NotePreview } from './noteEdits'
import { NoteGrips } from './NoteGrips'
import { GridGap } from './GridGap'
import type { StepWindow } from './visibleSteps'

/**
 * The piano roll, rendered as more rows of the same grid the drums live in.
 *
 * Sharing one grid rather than building a second one is what keeps the columns
 * lined up, the ruler and the add-measure button applicable to both, and the
 * playhead sweeping across the whole thing for free.
 *
 * Only the steps in `shown` are drawn, exactly as the drums do it, and for
 * the same reason. See visibleSteps.
 */
export function MelodyRows({
  steps,
  shown,
  preview,
}: {
  steps: number
  shown: StepWindow
  preview: NotePreview | null
}) {
  const melody = usePatternStore((s) => s.pattern.melody)
  const toggleMelodyMute = usePatternStore((s) => s.toggleMelodyMute)
  const setMelodyLevel = usePatternStore((s) => s.setMelodyLevel)
  const setMelodyVoice = usePatternStore((s) => s.setMelodyVoice)
  const open = useSettingsStore((s) => s.melodyOpen)
  const setMelodyOpen = useSettingsStore((s) => s.setMelodyOpen)

  const stepIndices = Array.from({ length: shown.to - shown.from }, (_, i) => shown.from + i)

  return (
    <>
      <div className="section-head">
        <div className="section-head__inner">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setMelodyOpen(!open)}
            aria-expanded={open}
          >
            <span className="section-toggle__caret" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            Melody
            {!open && melody.notes.length > 0 ? (
              <span className="section-toggle__count">{melody.notes.length}</span>
            ) : null}
          </button>

          {/* Shown whether or not the roll is expanded: the melody keeps
              playing when the section is collapsed, so its volume has to stay
              reachable, exactly like every drum track's does. */}
          <span className="section-head__controls">
            {/* The sound is part of the beat, not a setting, so it sits with
                the melody's other controls and is saved with it. */}
            <select
              className="section-head__voice"
              value={melody.voiceId}
              onChange={(e) => setMelodyVoice(e.target.value as MelodyVoiceId)}
              aria-label="Melody sound"
            >
              {MELODY_KIT.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="row__mute"
              onClick={toggleMelodyMute}
              aria-pressed={melody.muted}
              aria-label={`${melody.muted ? 'Unmute' : 'Mute'} melody`}
            >
              M
            </button>
            <input
              type="range"
              className="row__level"
              min={0}
              max={1}
              step={0.05}
              value={melody.level}
              onChange={(e) => setMelodyLevel(Number(e.target.value))}
              aria-label="Melody volume"
            />
          </span>
        </div>
      </div>

      {open
        ? PITCHES_TOP_DOWN.map((pitch) => [
            <div
              key={`pitch-${pitch}`}
              className={`row__label row__label--pitch${melody.muted ? ' row__label--muted' : ''}`}
              style={{ ['--track-color' as string]: pitchColor(pitch) }}
            >
              <span className="row__name">{pitchName(pitch)}</span>
            </div>,
            <GridGap key={`pitch-${pitch}-before`} span={shown.from} />,
            ...stepIndices.map((step) => {
              const fill = cellFill(melody, preview, pitch, step)
              const classes = [
                'cell',
                'note',
                fill ? `note--${fill.role}` : '',
                fill ? 'note--on' : '',
                fill?.draft ? 'note--draft' : '',
                bridgesGap(fill) ? 'note--bridge' : '',
                step % STEPS_PER_BEAT === 0 ? 'cell--beat' : '',
                step % STEPS_PER_MEASURE === 0 ? 'cell--bar' : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <button
                  key={`${pitch}-${step}`}
                  type="button"
                  className={classes}
                  data-pitch={pitch}
                  data-step={step}
                  style={{ ['--note-color' as string]: pitchColor(pitch) }}
                  aria-label={`${pitchName(pitch)} step ${step + 1}`}
                  aria-pressed={fill !== null}
                >
                  <NoteGrips role={fill && !fill.draft ? fill.role : null} />
                </button>
              )
            }),
            <GridGap key={`pitch-${pitch}-after`} span={steps - shown.to} />,
          ])
        : null}
    </>
  )
}
