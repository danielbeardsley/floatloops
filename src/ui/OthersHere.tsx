import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { barsLabel, ordinal } from './places'
import type { Ghosts } from './useGhosts'

/**
 * Who else is playing at this place, and where they stop being the same.
 *
 * The chips say which beats the outlines in the grid belong to, which is the
 * one thing a merged overlay cannot say for itself -- and tapping one takes it
 * out, because five rows at once is a mush and hiding is where the eye goes
 * first. Whether a chip is showing is a view of the song, not an edit to it.
 */
export function OthersHere({ ghosts }: { ghosts: Ghosts }) {
  const patternsById = useLibraryStore((s) => s.patternsById)
  const hidden = usePatternStore((s) => s.hiddenOthers)
  const toggleOther = usePatternStore((s) => s.toggleOther)
  const setAtBar = usePatternStore((s) => s.setAtBar)

  // An empty overlay reads as a bug. Saying it plainly does not.
  if (ghosts.sources.length === 0) {
    return <span className="in-song__none">Nothing else plays here</span>
  }

  return (
    <span className="others">
      {ghosts.sources.map((source) => {
        const name = patternsById.get(source.patternId)?.name ?? 'Missing beat'
        const showing = !hidden.includes(source.rowId)

        return (
          <button
            key={source.rowId}
            type="button"
            className={[
              'others__chip',
              showing ? 'others__chip--on' : '',
              source.muted ? 'others__chip--muted' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => toggleOther(source.rowId)}
            aria-pressed={showing}
            title={
              source.muted
                ? `${name} is muted in the song`
                : `${showing ? 'Hide' : 'Show'} ${name}`
            }
          >
            {name}
          </button>
        )
      })}

      {/*
       * The one thing that cannot be seen from here: that this is not how the
       * beats meet every time round. Naming the pass and offering to go there
       * is the whole of the help -- there is nothing to fix from this bar.
       */}
      {ghosts.elsewhere ? (
        <button
          type="button"
          className="others__elsewhere"
          onClick={() => setAtBar(ghosts.elsewhere?.bar ?? null)}
          title={`Edit at ${barsLabel(ghosts.elsewhere)} instead`}
        >
          They land differently the {ordinal(ghosts.elsewhere.time)} time
        </button>
      ) : null}
    </span>
  )
}
