import { useEffect, useRef } from 'react'
import 'asciinema-player/dist/bundle/asciinema-player.css'

const MONO = "'Fragment Mono', ui-monospace, monospace"

/**
 * The product demo: a real Claude Code session, recorded with asciinema and replayed as text, so
 * it stays crisp, selectable and a few kilobytes. Waits for the model are trimmed in the file
 * itself (scripts/polish-cast.py), with a pause after each answer to read it, so the player adds
 * no idle limit of its own. The player loads in the browser only, once the mono face is in: it
 * measures its character cell when it starts, and a face that swaps in later overlaps the text.
 */
export function DemoFilm() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let player: { dispose: () => void } | undefined
    let alive = true
    const font = document.fonts?.load(`400 1em ${MONO}`).catch(() => undefined)
    void Promise.all([import('asciinema-player'), font]).then(([AsciinemaPlayer]) => {
      if (!alive || !root.current) return
      player = AsciinemaPlayer.create('/demo.cast', root.current, {
        autoPlay: true,
        loop: true,
        preload: true,
        fit: 'width',
        speed: 1.25,
        controls: 'auto',
        theme: 'tokendoctor',
        terminalFontFamily: MONO,
      })
    })
    return () => {
      alive = false
      player?.dispose()
    }
  }, [])

  return <div ref={root} className="demo-film demo-cast" aria-label="tokendoctor in a real Claude Code session, recorded with asciinema" />
}
