import { usePatternStore } from '../state/patternStore'
import { useSettingsStore } from '../state/settingsStore'
import { PITCHES_TOP_DOWN, pitchName } from '../audio/scale'
import { STEPS_PER_BEAT, STEPS_PER_MEASURE } from '../audio/timing'
import { bridgesGap, cellFill, pitchColor } from './melodyCells'
import type { NotePreview } from './noteEdits'

/**
 * The piano roll, rendered as more rows of the same grid the drums live in.
 *
 * Sharing one grid rather than building a second one is what keeps the columns
 * lined up, the ruler and the add-measure button applicable to both, and the
 * playhead sweeping across the whole thing for free.
 */
export function MelodyRows({
  steps,
  preview,
}: {
  steps: number
  preview: NotePreview | null
}) {
  const melody = usePatternStore((s) => s.pattern.melody)
  const toggleMelodyMute = usePatternStore((s) => s.toggleMelodyMute)
  const setMelodyLevel = usePatternStore((s) => s.setMelodyLevel)
  const open = useSettingsStore((s) => s.melodyOpen)
  const setMelodyOpen = useSettingsStore((s) => s.setMelodyOpen)

  const stepIndices = Array.from({ length: steps }, (_, i) => i)

  return (
    <>
      <div className="melody-head">
        <div className="melody-head__inner">
          <button
            type="button"
            className="melody-toggle"
            onClick={() => setMelodyOpen(!open)}
            aria-expanded={open}
          >
            <span className="melody-toggle__caret" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            Melody
            {!open && melody.notes.length > 0 ? (
              <span className="melody-toggle__count">{melody.notes.length}</span>
            ) : null}
          </button>

          {/* Shown whether or not the roll is expanded: the melody keeps
              playing when the section is collapsed, so its volume has to stay
              reachable, exactly like every drum track's does. */}
          <span className="melody-head__controls">
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
                />
              )
            }),
          ])
        : null}
    </>
  )
}
