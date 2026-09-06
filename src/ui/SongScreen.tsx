import { useEffect } from 'react'
import { useLibraryStore } from '../state/libraryStore'
import { SongGrid } from './SongGrid'
import { SongTransport } from './Transport'
import { useStopOnLeave } from './useStopOnLeave'

/**
 * Song rows name library beats rather than holding them, so the library has to
 * be loaded before the grid can say what any row plays -- or the scheduler can
 * find anything to trigger.
 */
export function SongScreen() {
  const refresh = useLibraryStore((s) => s.refresh)
  useStopOnLeave()

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="sequencer">
      <SongTransport />
      <SongGrid />
    </div>
  )
}
