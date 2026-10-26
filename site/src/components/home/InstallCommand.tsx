import { Check, Copy } from './icons'
import { useEffect, useRef, useState } from 'react'

/** The install commands as one block with one Copy, in the ghost-button measure of the hero. */
export function InstallCommand({ commands }: { commands: readonly string[] }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands.join('\n'))
      setCopied(true)
    } catch {
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="install">
      <code>
        {commands.map((command) => (
          <span key={command} className="install-line">
            <span aria-hidden="true">$ </span>
            {command}
          </span>
        ))}
      </code>
      <button type="button" className="install-copy focus-ring" onClick={copy} aria-label="Copy the install commands">
        {copied ? <Check /> : <Copy />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
