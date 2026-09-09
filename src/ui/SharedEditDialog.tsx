import { useSharedEditPrompt } from './sharedBeat'

/**
 * The question asked before a change reaches songs other than the one on
 * screen. Both buttons save -- the choice is what gets saved -- so both say
 * "Save" and differ in what follows, rather than making one of them the
 * button you press to avoid the other.
 *
 * "Save as a copy" leads, being the one that cannot take anything away.
 */
export function SharedEditDialog() {
  const request = useSharedEditPrompt((s) => s.request)
  const choose = useSharedEditPrompt((s) => s.choose)

  if (!request) return null
  const { pattern, using, inOpen, others } = request

  const where = using.length === 1 ? using[0].name : `${using.length} songs`
  const rest = others.length === 1 ? 'the other song' : `the other ${others.length} songs`

  return (
    <div className="ask">
      <div className="ask__box" role="dialog" aria-modal="true" aria-labelledby="ask-title">
        <h2 className="ask__title" id="ask-title">
          “{pattern.name}” plays in {where}
        </h2>

        <p className="ask__body">
          {inOpen
            ? `Saving changes it everywhere. A copy would play in ${inOpen.name} only, and leave ${rest} as they are.`
            : `Saving changes it in ${using.length === 1 ? 'that song' : 'all of them'}. A copy would be a new beat, and leave your songs as they are.`}
        </p>

        <div className="ask__actions">
          <button type="button" className="button" onClick={() => choose('everywhere')}>
            Save
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => choose('copy')}
            autoFocus
          >
            Save as a copy
          </button>
        </div>
      </div>
    </div>
  )
}
