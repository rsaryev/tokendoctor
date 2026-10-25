import { useMemo, useRef } from 'react'
import { useSession } from './useSession'

/**
 * The product demo, the recorded audit, replayed in a terminal. A visitor can type /help into it to take over.
 */
export function DemoFilm() {
  const root = useRef<HTMLDivElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const refs = useMemo(() => ({ root, screen, input }), [])
  const session = useSession(refs)

  return (
    <div
      ref={root}
      className={`demo-film demo-term${session.busy ? ' is-busy' : ''}`}
      onClick={session.focus}
      aria-label="tokendoctor auditing a Claude Code setup, replayed from a recorded run"
    >
      <div ref={screen} className="screen" role="log" aria-live="off">
        {session.lines.map((line) => (
          <div key={line.id} className={`l ${line.kind}`}>
            {line.text}
          </div>
        ))}
        <label className="entry">
          <span className="ps" aria-hidden="true">
            ›
          </span>
          <input
            ref={input}
            type="text"
            value={session.input}
            onChange={session.onChange}
            onKeyDown={session.onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            aria-label="Type /help"
          />
        </label>
      </div>
    </div>
  )
}
