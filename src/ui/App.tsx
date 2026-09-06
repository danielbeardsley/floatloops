import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { confirmLeavingBeatForSong } from './unsavedBeat'
import { SequencerScreen } from './SequencerScreen'
import { SongScreen } from './SongScreen'
import { LibraryScreen } from './LibraryScreen'
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
 * Leaving the sequencer by this link is the other way back to a song, so it
 * carries the same warning the way-back bar does: a song row names a library
 * beat, and unsaved edits are not in it.
 */
export function Nav() {
  const onSequencer = useLocation().pathname === '/'

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
      <NavLink to="/library" className="app__link">
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
        </header>

        <main className="app__main">
          <Routes>
            <Route path="/" element={<SequencerScreen />} />
            <Route path="/song" element={<SongScreen />} />
            <Route path="/library" element={<LibraryScreen />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
