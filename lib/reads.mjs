// Bash commands that only print files. The slide (hooks/window.ts) treats them as reads: a print that
// a later read or edit of the same file made stale goes first, as a stale Read does. The session
// report counts them. Only a command that does nothing but print files counts: a pipe, a redirect, a
// heredoc, a glob or any other command in the chain makes it something else.

/** Commands that print a file and nothing else, given only files (and the flags below). */
const PRINTERS = new Set(['cat', 'head', 'tail', 'nl', 'sed'])

/** Shell syntax that makes a command more than a read: pipes, redirects, substitutions, globs. */
const SHELL = /[|<>`$*?{}()\\]/

const RANGE = /^\d+(,\d+|,\$)?p$/

/** One word of a command, its quotes taken off. */
const unquote = (word) => word.replace(/^(['"])(.*)\1$/, '$2')

/** The words of a simple command, or undefined where quoting is more than a word in quotes. */
function words(segment) {
  const out = segment.match(/'[^']*'|"[^"]*"|[^\s'"]+/g)
  if (!out || out.join('').length !== segment.replace(/\s+/g, '').length) return undefined
  return out.map(unquote)
}

/** The files one step prints, or undefined when it is not a plain read. */
function printed(step) {
  const w = words(step)
  if (!w?.length || !PRINTERS.has(w[0])) return undefined
  const [name, ...rest] = w
  // Only `sed -n '<range>p'` prints; any other script edits or filters.
  if (name === 'sed' && !(rest.includes('-n') && rest.some((a) => RANGE.test(a)))) return undefined
  const files = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (name === 'sed') {
      if (a === '-n' || RANGE.test(a)) continue
      if (a.startsWith('-')) return undefined
    } else if (name === 'head' || name === 'tail') {
      if (a === '-f' || a === '-F' || a.startsWith('--follow')) return undefined
      if (a === '-n' || a === '-c') { i++; continue }
      if (/^-[nc]?\d+$/.test(a)) continue
      if (a.startsWith('-')) return undefined
    } else if (a.startsWith('-')) {
      // cat -n, nl -ba: numbering only.
      if (!/^-[A-Za-z]+$/.test(a)) return undefined
      continue
    }
    if (a === '-' || a.startsWith('/dev/') || a.startsWith('/proc/')) return undefined
    files.push(a)
  }
  return files.length ? files : undefined
}

/**
 * The files a Bash command only prints, or undefined when it does anything else. Leading `cd <dir>`
 * steps are allowed; every other step joined by `&&` or `;` has to be a plain read.
 */
export function fileRead(command) {
  if (!command || command.includes('\n') || SHELL.test(command)) return undefined
  const files = []
  let reads = 0
  for (const step of command.split(/&&|;/).map((s) => s.trim()).filter(Boolean)) {
    if (/^cd\s+\S+$/.test(step)) continue
    const f = printed(step)
    if (!f) return undefined
    files.push(...f)
    reads++
  }
  return reads ? files : undefined
}

/** A Bash command that waits by sleeping, as a polling loop does. */
export const waits = (command) => /(^|[;&|(\s])sleep\s+\d/.test(command ?? '')
