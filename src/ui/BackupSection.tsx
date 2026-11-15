import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { BackupError } from '../state/backup'
import {
  isIosBrowserTab,
  requestPersistence,
  storagePersistence,
  type Persistence,
} from '../state/persistence'
import { describeLoad, loadBackupFile, saveBackup } from './backup'

type Status = { text: string; error?: boolean } | null

function failure(error: unknown, fallback: string): Status {
  if (error instanceof BackupError) return { text: error.message, error: true }
  if (error instanceof Error && error.message) return { text: error.message, error: true }
  return { text: fallback, error: true }
}

/**
 * How safe the work is where it is. Safari on iOS gets its own warning, being
 * the one browser that throws saved work away on a timer rather than only
 * when space runs out -- and the one where the fix is in the user's hands.
 */
function Safety({ persistence }: { persistence: Persistence }) {
  if (isIosBrowserTab()) {
    return (
      <p className="library__message backup__warning">
        On iPad and iPhone, Safari clears saved work after a week without a visit. To keep it, add
        FloatLoops to your Home Screen: tap Share, then Add to Home Screen.
      </p>
    )
  }
  if (persistence === 'persisted') {
    return <p className="library__message">This browser has agreed not to clear them.</p>
  }
  if (persistence === 'best-effort') {
    return (
      <p className="library__message">
        This browser may still clear them to free up space, so a backup is worth keeping.
      </p>
    )
  }
  return null
}

/**
 * The bottom of the library: a file to keep, and a way to put one back.
 *
 * Everything else on this screen lives in the browser, which is allowed to
 * clear it. This is the part that does not.
 */
export function BackupSection() {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [persistence, setPersistence] = useState<Persistence>('unknown')

  useEffect(() => {
    void storagePersistence().then(setPersistence)
  }, [])

  const onSave = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outcome = await saveBackup()
      if (outcome !== 'cancelled') {
        setStatus({ text: 'Backup saved. Keep the file somewhere safe.' })
      }
    } catch (error) {
      setStatus(failure(error, 'Could not make a backup.'))
    } finally {
      setBusy(false)
    }
  }

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still counts as a change.
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setStatus(null)
    try {
      setStatus({ text: describeLoad(await loadBackupFile(file)) })
      // Loading asks for persistence; this is the answer to that same request.
      void requestPersistence().then(setPersistence)
    } catch (error) {
      setStatus(failure(error, 'Could not load that backup.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="library__section backup" aria-labelledby="backup-title">
      <div className="library__head">
        <h2 className="library__title" id="backup-title">
          Backup
        </h2>
      </div>

      <p className="library__message">
        Your beats and songs are kept in this browser. Save a backup file to keep them safe, or to
        move them to another device. Loading a backup only adds to what is here.
      </p>
      <Safety persistence={persistence} />

      <div className="backup__actions">
        <button type="button" className="button" onClick={() => void onSave()} disabled={busy}>
          Save backup
        </button>
        <button
          type="button"
          className="button"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          Load backup
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="backup__file"
          aria-label="Backup file"
          onChange={(event) => void onPick(event)}
          hidden
        />
      </div>

      <p
        className={`library__message backup__status${status?.error ? ' library__message--error' : ''}`}
        role="status"
      >
        {status?.text}
      </p>
    </section>
  )
}
