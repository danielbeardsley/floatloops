import { useMemo } from 'react'
import { usePatternStore } from '../state/patternStore'
import { useSettingsStore } from '../state/settingsStore'
import {
  MELODY_VIEWS,
  viewHasKey,
  visiblePitches,
  type MelodyView,
} from '../state/melodyView'
import { KEYS, isAccidental, pitchName } from '../audio/scale'
import { MELODY_KIT, type MelodyVoiceId } from '../audio/melodyKit'
import { STEPS_PER_BEAT, STEPS_PER_MEASURE } from '../audio/timing'
import { bridgesGap, cellFill, pitchColor } from './melodyCells'
import type { NotePreview } from './noteEdits'
import { NoteGrips } from './NoteGrips'
import { GhostMark } from './GhostMark'
import { GHOST_NONE, ghostRole, type GhostMarks } from './ghostMarks'
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
  ghosts,
  playedSteps,
}: {
  steps: number
  shown: StepWindow
  preview: NotePreview | null
  ghosts: GhostMarks | null
  playedSteps: number | null
}) {
  const melody = usePatternStore((s) => s.pattern.melody)
  const toggleMelodyMute = usePatternStore((s) => s.toggleMelodyMute)
  const setMelodyLevel = usePatternStore((s) => s.setMelodyLevel)
  const setMelodyVoice = usePatternStore((s) => s.setMelodyVoice)
  const open = useSettingsStore((s) => s.melodyOpen)
  const setMelodyOpen = useSettingsStore((s) => s.setMelodyOpen)
  const view = useSettingsStore((s) => s.melodyView)
  const setMelodyView = useSettingsStore((s) => s.setMelodyView)
  const melodyKey = useSettingsStore((s) => s.melodyKey)
  const setMelodyKey = useSettingsStore((s) => s.setMelodyKey)
  const narrow = useSettingsStore((s) => s.melodyNarrow)
  const setMelodyNarrow = useSettingsStore((s) => s.setMelodyNarrow)

  const stepIndices = Array.from({ length: shown.to - shown.from }, (_, i) => shown.from + i)

  // Every note is looked at to decide this, which is cheap next to drawing the
  // rows it decides -- but not cheap enough to redo on a playhead frame.
  const pitches = useMemo(
    () => visiblePitches({ view, key: melodyKey, narrow, notes: melody.notes }),
    [view, melodyKey, narrow, melody.notes],
  )

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

      {/* The rows to draw are a view, not part of the beat, so this sits with
          the roll rather than in the header the melody's own controls are in.
          Hidden with the roll: there is nothing to choose rows for when none
          are drawn. */}
      {open ? (
        <div className="row-picker">
          <div className="row-picker__inner">
            <select
              className="row-picker__select"
              data-passive
              value={view}
              onChange={(e) => setMelodyView(e.target.value as MelodyView)}
              aria-label="Which rows to show"
            >
              {MELODY_VIEWS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>

            {/* Only the scale views have a root to move, so the key goes away
                rather than sitting there doing nothing. */}
            {viewHasKey(view) ? (
              <select
                className="row-picker__select"
                data-passive
                value={melodyKey}
                onChange={(e) => setMelodyKey(Number(e.target.value))}
                aria-label="Key"
              >
                {KEYS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}

            <label className="row-picker__narrow">
              <input
                type="checkbox"
                data-passive
                checked={narrow}
                onChange={(e) => setMelodyNarrow(e.target.checked)}
              />
              Just my range
            </label>
          </div>
        </div>
      ) : null}

      {open
        ? pitches.map((pitch) => [
            <div
              key={`pitch-${pitch}`}
              className={`row__label row__label--pitch${melody.muted ? ' row__label--muted' : ''}${
                isAccidental(pitch) ? ' row__label--sharp' : ''
              }`}
              style={{ ['--track-color' as string]: pitchColor(pitch) }}
            >
              <span className="row__name">{pitchName(pitch)}</span>
            </div>,
            <GridGap key={`pitch-${pitch}-before`} span={shown.from} />,
            ...stepIndices.map((step) => {
              const fill = cellFill(melody, preview, pitch, step)
              const ghost = ghosts?.notes[pitch]?.[step] ?? GHOST_NONE
              const classes = [
                'cell',
                'note',
                playedSteps !== null && step >= playedSteps ? 'cell--unplayed' : '',
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
                  aria-label={`${pitchName(pitch)} step ${step + 1}${
                    ghost > GHOST_NONE ? ', another beat plays here' : ''
                  }`}
                  aria-pressed={fill !== null}
                >
                  <GhostMark level={ghost} role={ghostRole(ghosts?.notes[pitch], step)} />
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
