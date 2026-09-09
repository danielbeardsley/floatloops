import { useEffect } from 'react'
import { useLibraryStore } from '../state/libraryStore'
import { BeatInSong } from './BeatInSong'
import { Grid } from './Grid'
import { Transport } from './Transport'
import { useStopOnLeave } from './useStopOnLeave'

/**
 * The library is loaded here too, not just on the song and library screens:
 * the beat on screen cannot say which songs play it, or whether it is saved at
 * all, until the library has arrived.
 */
export function SequencerScreen() {
  const refresh = useLibraryStore((s) => s.refresh)
  useStopOnLeave()

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="sequencer">
      <BeatInSong />
      <Transport />
      <Grid />
    </div>
  )
}
