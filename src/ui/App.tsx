import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { confirmLeavingBeatForSong, confirmLeavingSongForLibrary } from './unsaved'
import { SequencerScreen } from './SequencerScreen'
import { SongScreen } from './SongScreen'
import { LibraryScreen } from './LibraryScreen'
import { RefreshButton } from './Refresh'
import { SharedEditDialog } from './SharedEditDialog'
import './app.css'

/**
 * Hash routing so the back button behaves once the app is installed to the
 * home screen.
 *
 * The audio engine lives outside the router and survives navigation; the
 * transport does not. Each screen stops what it started when it goes away,
 * because a beat playing on from a screen you have left has no playhead and
 * no stop button.
 */
/**
 * The two links that can walk away from unsaved work carry the warnings.
 *
 * Sequencer to song: a song row names a *library* beat, so unsaved edits are
 * simply not in what the song plays. Song to library: the library is where an
 * arrangement is replaced, by opening another or starting a new one.
 *
 * Song to beat is not guarded. Nothing is lost by it -- the song is still
 * there when you come back, which is the whole point of the way-back bar --
 * and it is the ordinary way to fix a beat mid-arrangement.
 */
export function Nav() {
  const path = useLocation().pathname
  const onSequencer = path === '/'
  const onSong = path === '/song'

  return (
    <nav className="app__nav">
      <NavLink to="/" end className="app__link">
        Beat
      </NavLink>
      <NavLink
        to="/song"
        className="app__link"
        onClick={(event) => {
          if (onSequencer && !confirmLeavingBeatForSong()) event.preventDefault()
        }}
      >
        Song
      </NavLink>
      <NavLink
        to="/library"
        className="app__link"
        onClick={(event) => {
          if (onSong && !confirmLeavingSongForLibrary()) event.preventDefault()
        }}
      >
        Library
      </NavLink>
    </nav>
  )
}

export function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app__bar">
          <h1 className="app__title">FloatLoops</h1>
          <Nav />
          <RefreshButton />
        </header>

        <main className="app__main">
          <Routes>
            <Route path="/" element={<SequencerScreen />} />
            <Route path="/song" element={<SongScreen />} />
            <Route path="/library" element={<LibraryScreen />} />
          </Routes>
        </main>

        {/* Outside the routes: it belongs to the save, not to a screen. */}
        <SharedEditDialog />
      </div>
    </HashRouter>
  )
}
