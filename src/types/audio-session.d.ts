/**
 * Safari 16.4+ exposes navigator.audioSession. Setting it to 'playback' is what
 * stops the iPad's physical silent switch from muting Web Audio output.
 * Not in lib.dom.d.ts yet, so it is declared here.
 */
interface AudioSession {
  type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'
}

interface Navigator {
  audioSession?: AudioSession
}
