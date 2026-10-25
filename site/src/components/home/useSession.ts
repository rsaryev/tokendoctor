import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react'
import { APPLY, APPLY_OUT, AUDIT, AUDIT_OUT, HELP } from './recording'
import type { Kind, Out } from './recording'

// The demo's engine: replays the recorded audit, rests, and replays again while the demo is on
// screen and the visitor is not typing. A visitor who types takes over: the replay stops and a few
// commands answer.

export interface Line {
  id: number
  kind: Kind
  text: string
}

export interface DemoRefs {
  root: RefObject<HTMLDivElement | null>
  screen: RefObject<HTMLDivElement | null>
  input: RefObject<HTMLInputElement | null>
}

class Cancelled extends Error {}

export function useSession(refs: DemoRefs) {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const linesRef = useRef<Line[]>([])
  const nextId = useRef(0)
  const token = useRef(0) // anything newer cancels what is playing
  const touched = useRef(0) // when the visitor last typed
  const typing = useRef(false)
  const reduced = useRef(false)
  const timers = useRef(new Set<number>())

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }, [])

  const sleep = useCallback(
    (ms: number, mine: number) =>
      new Promise<void>((resolve, reject) => {
        later(() => (mine === token.current ? resolve() : reject(new Cancelled())), reduced.current ? Math.min(ms, 1) : ms)
      }),
    [later],
  )

  const line = useCallback((kind: Kind, text: string) => {
    linesRef.current = [...linesRef.current, { id: nextId.current++, kind, text }]
    setLines(linesRef.current)
  }, [])
  const clear = useCallback(() => {
    linesRef.current = []
    setLines([])
  }, [])

  const typeCommand = useCallback(
    async (command: string, mine: number) => {
      typing.current = true
      let typed = ''
      for (const ch of command) {
        await sleep(18 + Math.random() * 26, mine)
        typed += ch
        setInput(typed)
      }
      await sleep(350, mine)
      typing.current = false
      setInput('')
      line('cmd', `› ${command}`)
    },
    [line, sleep],
  )

  const play = useCallback(
    async (out: readonly Out[], mine: number, gap: number) => {
      for (const o of out) {
        await sleep(o.kind === 'plain' || o.kind === 'dim' ? gap / 2 : gap, mine)
        line(o.kind, o.text)
      }
    },
    [line, sleep],
  )

  const replay = useCallback(
    async (mine: number) => {
      clear()
      await sleep(900, mine)
      setBusy(true)
      await typeCommand(AUDIT, mine)
      await play(AUDIT_OUT, mine, 420)
      setBusy(false)
      await sleep(1800, mine)
      setBusy(true)
      await typeCommand(APPLY, mine)
      await play(APPLY_OUT, mine, 650)
      setBusy(false)
    },
    [clear, play, sleep, typeCommand],
  )

  const cancel = useCallback(() => {
    token.current += 1
    typing.current = false
    setBusy(false)
  }, [])

  const submit = useCallback(
    (text: string) => {
      const entry = text.trim()
      if (!entry) return
      line('cmd', `› ${entry}`)
      if (entry === '/help') HELP.forEach((t) => line('dim', t))
      else if (entry === '/clear') clear()
      else if (entry === AUDIT) AUDIT_OUT.forEach((o) => line(o.kind, o.text))
      else if (entry.startsWith('/tokendoctor:apply')) APPLY_OUT.forEach((o) => line(o.kind, o.text))
      else line('dim', 'This page replays a recorded run. Install the plugin to audit your own setup.')
    },
    [clear, line],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      touched.current = Date.now()
      if (event.key === 'Enter') {
        event.preventDefault()
        cancel()
        const text = event.currentTarget.value
        setInput('')
        submit(text)
      }
    },
    [cancel, submit],
  )

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      touched.current = Date.now()
      cancel()
      setInput(event.target.value)
    },
    [cancel],
  )

  const focus = useCallback(() => refs.input.current?.focus({ preventScroll: true }), [refs.input])

  useLayoutEffect(() => {
    const screen = refs.screen.current
    if (screen) screen.scrollTop = screen.scrollHeight
  }, [lines, refs.screen])

  useLayoutEffect(() => {
    const field = refs.input.current
    if (field && typing.current) field.scrollLeft = field.scrollWidth
  }, [input, refs.input])

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pending = timers.current
    let alive = true

    const loop = async () => {
      while (alive) {
        if (Date.now() - touched.current > 9000) {
          const mine = ++token.current
          try {
            await replay(mine)
            await sleep(8000, mine)
          } catch {
            typing.current = false
            setBusy(false)
          }
        } else {
          await new Promise<void>((resolve) => later(resolve, 1000))
        }
      }
    }

    const root = refs.root.current
    let seen: IntersectionObserver | undefined
    if (root && 'IntersectionObserver' in window) {
      seen = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            seen?.disconnect()
            void loop()
          }
        },
        { threshold: 0.3 },
      )
      seen.observe(root)
    } else {
      void loop()
    }

    return () => {
      alive = false
      token.current += 1
      seen?.disconnect()
      pending.forEach((id) => window.clearTimeout(id))
      pending.clear()
    }
  }, [later, refs.root, replay, sleep])

  return { lines, input, busy, onKeyDown, onChange, focus }
}
