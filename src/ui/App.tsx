import { SoundCheck } from './SoundCheck'
import './app.css'

export function App() {
  return (
    <div className="app">
      <header className="app__bar">
        <h1 className="app__title">FloatLoops</h1>
      </header>
      <main className="app__main">
        <SoundCheck />
      </main>
    </div>
  )
}
