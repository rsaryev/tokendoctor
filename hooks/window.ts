import type { SessionMessage } from 'claude-code'

// Slides the context window instead of summarizing it, as llx does (llx/packages/agent/src/history.rs):
// tool outputs and large tool arguments become short pointers that say what they were and how to get
// them back. No summary, and every prompt, answer and decision stays word for word.
//
// What goes first: outputs that are stale for sure (a file read again or changed later), then what an
// edit wrote (it is on disk), then everything else, oldest first, until enough is free.
//
// The prompt cache: any change to an old message re-sends what follows it uncached, and the API looks
// for an earlier cached prefix only 20 blocks behind the request's last cache mark, which Claude Code
// sets at the end. So after a slide, as after a summary, only the system prompt and tools are read from
// the cache, and the rest is written once more. What a slide can do is be rare and leave little behind:
// - it runs only where Claude Code would compact anyway, never on a turn of its own;
// - it frees down to `slideTo` percent of where Claude Code compacts, so many turns pass before the next;
// - a pointer is never worth eliding again, so a pass never rewrites what an earlier one settled.

/** Characters below which nothing is worth eliding: a pointer is far shorter. */
const MIN_CHARS = 400
/** Tokens of the recent conversation left alone, and the fewest messages it holds. */
const TAIL_TOKENS = 16_384
const MIN_TAIL = 4
/** Characters per token where no better ratio is known. */
const CHARS_PER_TOKEN = 4
export const MARKER = 'elided by tokendoctor to save context'

/** Tool results that cannot be had again by calling the tool: never elided. */
const KEEP = new Set(['Agent', 'Task', 'AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'TodoWrite'])
/** Tools that write a file: what they wrote is on disk, and a read before them is stale. */
const WRITERS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

type Call = { tool: string; input: Record<string, unknown> }

export type Slide = {
  messages: SessionMessage[]
  /** Messages changed, the oldest turns removed and the tokens freed (estimated). */
  elided: number
  turns: number
  freed: number
}

/**
 * Elide enough of `messages` to free `need` tokens (at least `least` when that spares the outputs the
 * model has not answered yet): stale reads first, then what edits wrote, then the rest, each oldest
 * first; null when eliding everything outside the last few messages does not free `need`.
 * `tokensPerChar` turns the characters counted here into the model's tokens.
 *
 * Every message comes back built anew, with no engine handle: a message handed back with its handle
 * keeps its API message id, and Claude Code, reading the transcript again (`--resume`, `-c`, a later
 * compaction), joins rows that share an id across compactions, pulling every earlier copy back in.
 */
export function slide(messages: readonly SessionMessage[], need: number, tokensPerChar = 1 / CHARS_PER_TOKEN, least = need): Slide | null {
  const calls = new Map<string, Call>()
  for (const m of messages) for (const u of m.toolUses) calls.set(u.tool_use_id, { tool: u.tool, input: u.input })
  const stale = staleReads(messages)

  const elided = messages.map(m => elide(m, calls))
  const saving = messages.map((m, i) => (elided[i] ? (chars(m) - chars(elided[i]!)) * tokensPerChar : 0))
  // 0: a read made stale by a later read or edit of the same file; 1: what an edit wrote; 2: the rest.
  const rank = messages.map(m => {
    if (m.toolResults?.some(r => stale.has(r.tool_use_id))) return 0
    if (m.toolUses.some(u => WRITERS.has(u.tool))) return 1
    return 2
  })

  const attempt = (end: number, enough: number = need) => {
    const order = [...Array(end).keys()].filter(i => saving[i]! > 0).sort((a, b) => rank[a]! - rank[b]! || a - b)
    const chosen = new Set<number>()
    let freed = 0
    for (const i of order) {
      if (freed >= need) break
      chosen.add(i)
      freed += saving[i]!
    }
    return freed >= enough ? { chosen, freed } : null
  }
  // Outputs the model has not answered with a word yet are kept, even if that frees only `least`:
  // nothing it concluded from them is in the conversation, so a pointer saying so would be false and
  // the model would read them all again. Where that or the tail cannot be spared enough, they give
  // way, all but the last messages.
  // Freed enough already (what the caller counts besides, such as images, covers it): every
  // message is still handed back rebuilt, nothing elided.
  if (need <= 0) return { messages: messages.map(rebuild), elided: 0, turns: 0, freed: 0 }
  const tail = tailStart(messages, tokensPerChar)
  const built = (chosen: Set<number>) => messages.map((m, i) => (chosen.has(i) ? elided[i]! : rebuild(m)))
  const found = attempt(Math.min(tail, unanswered(messages)), Math.max(1, Math.min(least, need))) ?? attempt(tail)
  if (found) return { messages: built(found.chosen), elided: found.chosen.size, turns: 0, freed: Math.round(found.freed) }

  // Eliding every output outside the tail is not enough: what stays is the conversation itself and
  // its pointers, which grow with every turn. Rather than a summary, the oldest turns go whole,
  // with a card saying what they held, as localix's checkpoints evict turns into epoch cards.
  const all = attempt(tail, 0)!
  const evicted = evict(built(all.chosen), need - all.freed, tokensPerChar, tail, least - all.freed)
  if (evicted) {
    return { messages: evicted.messages, elided: all.chosen.size, turns: evicted.turns, freed: Math.round(all.freed + evicted.freed) }
  }
  // No turns to remove (one long task): every output outside the tail, if that frees `least`.
  const most = attempt(tail, Math.max(1, least))
  if (most) return { messages: built(most.chosen), elided: most.chosen.size, turns: 0, freed: Math.round(most.freed) }
  const last = attempt(Math.max(0, messages.length - MIN_TAIL))
  return last ? { messages: built(last.chosen), elided: last.chosen.size, turns: 0, freed: Math.round(last.freed) } : null
}

/**
 * `messages` without their oldest turns, enough to free `need` tokens: a turn starts at a prompt the
 * person typed, so no call is parted from its result. What the turns held, the prompts, the files read
 * and changed, goes on a card at the head of the first prompt kept. Where the turns before `end` do
 * not free `need` (what stays includes what no slide can free: the system prompt, what Claude Code
 * attaches), all of them go if that frees `least`; else null.
 */
export function evict(messages: SessionMessage[], need: number, tokensPerChar: number, end: number, least = need) {
  if (need <= 0) return { messages, turns: 0, freed: 0 }
  const starts = messages.map((m, i) => (i > 0 && i < end && isPrompt(m) ? i : -1)).filter(i => i > 0)
  let removed = 0
  let best: { messages: SessionMessage[]; turns: number; freed: number } | null = null
  for (const [n, cut] of starts.entries()) {
    removed += messages.slice(n ? starts[n - 1]! : 0, cut).reduce((sum, m) => sum + chars(m), 0)
    const head = messages[cut]!
    const text = `${card(messages.slice(0, cut), n + 1)}\n\n${head.text}`
    const freed = (removed - (text.length - head.text.length)) * tokensPerChar
    best = { messages: [{ ...head, text }, ...messages.slice(cut + 1)], turns: n + 1, freed }
    if (freed >= need) return best
  }
  return best && best.freed >= least ? best : null
}

/** A prompt the person typed: a user message with words and no tool result. */
function isPrompt(m: SessionMessage) {
  return m.role === 'user' && !m.toolResults?.length && m.text.trim().length > 0 && !m.text.startsWith(`[${CARD}`)
}

const CARD = 'tokendoctor removed'

/** What removed turns held, in a few lines: what the person asked, which files were read and changed. */
function card(removed: readonly SessionMessage[], turns: number) {
  const short = (t: string) => (t.length > 160 ? `${t.slice(0, 157).trimEnd()}...` : t).replace(/\s+/g, ' ')
  // What the person typed; notices Claude Code adds as user messages (a finished task, a command's
  // output) are not their words.
  const prompts = removed.filter(m => m.role === 'user' && !m.toolResults?.length && m.text.trim() && !/^<(task-notification|local-command|system-reminder)/.test(m.text.trim()))
  // A prompt that carries an earlier card: that card's first line stands for the turns it removed.
  const asked = prompts.flatMap(m => {
    if (!m.text.startsWith(`[${CARD}`)) return [short(m.text)]
    const cut = m.text.indexOf('\n\n')
    const rest = cut < 0 ? '' : m.text.slice(cut + 2)
    return [`(earlier: ${m.text.slice(1, m.text.indexOf('\n')).replace(/,? with no summary\.?$/, '')})`, ...(rest.trim() ? [short(rest)] : [])]
  })
  const shown = asked.length > 12 ? [...asked.slice(0, 4), `... ${asked.length - 8} more ...`, ...asked.slice(-4)] : asked
  const read = new Set<string>()
  const changed = new Set<string>()
  for (const m of removed) for (const u of m.toolUses) {
    const file = fileOf(u.input)
    if (file) (WRITERS.has(u.tool) ? changed : read).add(file)
  }
  const list = (files: Set<string>) => [...files].slice(-30).join(', ') || 'none'
  return [
    `[${CARD} the ${turns} oldest turn${turns === 1 ? '' : 's'} of this conversation to save context, with no summary.`,
    'What happened in them is on disk and in what follows; what they asked:',
    ...shown.map(a => `- ${a}`),
    `Files read: ${list(read)}. Files changed: ${list(changed)}.]`,
  ].join('\n')
}

/** Tokens an image costs the model: about what a 1280-pixel screenshot does (calibration refines the rest). */
export const IMAGE_TOKENS = 1500

/**
 * Images the messages from `from` on still carry: Claude Code names each one a tool returned
 * (`[Image: source: <file>]`) beside it. A message handed back without its handle carries none, so
 * those named before `from` (the last slide) are already gone, as are those behind a pointer.
 */
export function imagesIn(messages: readonly SessionMessage[], from = 0) {
  let n = 0
  for (const m of messages.slice(Math.max(0, from))) {
    for (const r of m.toolResults ?? []) if (!r.text.includes(MARKER)) n += r.text.match(/\[Image: source: /g)?.length ?? 0
  }
  return n
}

/** What Claude Code adds back after a compaction beyond what was estimated, learned as localix does: a moving average. */
export function calibrate(previous: number | undefined, seen: number) {
  const next = previous === undefined ? seen : previous + 0.35 * (seen - previous)
  return Math.round(Math.min(200_000, Math.max(0, next)))
}

/**
 * The conversation without the copies Claude Code may hand back after earlier compactions. A tool
 * call or result is kept once by its id; a message without one is dropped when the same one stands
 * among the few just before it.
 */
export function dedupe(messages: readonly SessionMessage[]): SessionMessage[] {
  const ids = new Set<string>()
  const out: SessionMessage[] = []
  const recent: string[] = []
  for (const m of messages) {
    const own = [...m.toolUses.map(u => u.tool_use_id), ...(m.toolResults ?? []).map(r => `r:${r.tool_use_id}`)]
    const key = `${m.role}\u0000${m.text}\u0000${own.join(',')}`
    const copy = own.length ? own.every(id => ids.has(id)) : recent.includes(key)
    recent.push(key)
    if (recent.length > 8) recent.shift()
    if (copy) continue
    for (const id of own) ids.add(id)
    out.push(m)
  }
  return out
}

/** The results of reads whose file is read again or changed by a later call. */
function staleReads(messages: readonly SessionMessage[]) {
  const stale = new Set<string>()
  const later = new Set<string>()
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const u of [...messages[i]!.toolUses].reverse()) {
      const file = fileOf(u.input)
      if (!file) continue
      if (u.tool === 'Read' && later.has(file)) stale.add(u.tool_use_id)
      if (u.tool === 'Read' || WRITERS.has(u.tool)) later.add(file)
    }
  }
  return stale
}

/** The message as plain parts, for the engine to build anew. */
function rebuild(m: SessionMessage): SessionMessage {
  const toolUses = m.toolUses.map(u => ({ tool_use_id: u.tool_use_id, tool: u.tool, input: u.input }))
  if (!m.toolResults?.length) return { role: m.role, text: m.text, toolUses }
  const toolResults = m.toolResults.map(r => ({ tool_use_id: r.tool_use_id, text: r.text, isError: r.isError }))
  return { role: m.role, text: m.text, toolUses, toolResults }
}

/** The message with its large tool outputs and arguments elided, or null when nothing in it is worth it. */
function elide(m: SessionMessage, calls: Map<string, Call>): SessionMessage | null {
  if (m.role === 'user' && m.toolResults?.length) {
    let changed = false
    const toolResults = m.toolResults.map(r => {
      const call = calls.get(r.tool_use_id)
      if (r.text.length < MIN_CHARS || r.text.includes(MARKER) || KEEP.has(call?.tool ?? '')) {
        return { tool_use_id: r.tool_use_id, text: r.text, isError: r.isError }
      }
      changed = true
      return { tool_use_id: r.tool_use_id, text: pointer(call, r.text), isError: r.isError }
    })
    return changed ? { role: m.role, text: m.text, toolUses: [], toolResults } : null
  }
  if (m.role === 'assistant' && m.toolUses.length) {
    let changed = false
    const toolUses = m.toolUses.map(u => {
      const plain = { tool_use_id: u.tool_use_id, tool: u.tool, input: u.input }
      if (KEEP.has(u.tool)) return plain
      const input: Record<string, unknown> = {}
      let large = false
      for (const [key, value] of Object.entries(u.input)) {
        const big = typeof value === 'string' ? value.length >= MIN_CHARS : JSON.stringify(value ?? null).length >= MIN_CHARS
        if (big && !(typeof value === 'string' && value.includes(MARKER))) {
          large = true
          input[key] = WRITERS.has(u.tool) ? `[${MARKER}: what this wrote is on disk]` : `[${MARKER}]`
        } else input[key] = value
      }
      if (!large) return plain
      changed = true
      return { tool_use_id: u.tool_use_id, tool: u.tool, input }
    })
    return changed ? { role: m.role, text: m.text, toolUses } : null
  }
  return null
}

/** What an elided output says: what it was, that what came of it is in the conversation, and how to get it back. */
function pointer(call: Call | undefined, output: string) {
  const tool = call?.tool ?? 'the tool'
  const file = call ? fileOf(call.input) : undefined
  const what = tool === 'Read' && file ? `${tool} of ${file}` : `${tool} output`
  // Claude Code keeps an image a tool returned as a file and names it in the result: the name stays,
  // so the model can look at it again without taking the screenshot again.
  const images = [...output.matchAll(/\[Image: source: [^\]\n]+\]/g)].map(m => m[0])
  const kept = images.length ? ` The image${images.length > 1 ? 's are' : ' is'} on disk, Read to see again: ${images.join(' ')}` : ''
  // The model saw the output whole when the call ran. Told only that it is gone, a model may take its
  // own notes on it for made up and read everything again.
  return `[${MARKER}: ${output.length} characters of ${what}. You saw this output in full when the call ran; it was removed from the conversation afterwards. What you wrote after it was written from the full text and stays true. Call the tool again only if you need its exact text now.${kept}]`
}

function fileOf(input: Record<string, unknown>) {
  const file = input.file_path ?? input.notebook_path ?? input.path
  return typeof file === 'string' ? file : undefined
}

/** Where the protected tail starts: TAIL_TOKENS, and at least MIN_TAIL messages, from the end. */
function tailStart(messages: readonly SessionMessage[], tokensPerChar: number) {
  let size = 0
  let start = messages.length
  while (start > 0) {
    size += chars(messages[start - 1]!) * tokensPerChar
    if (size > TAIL_TOKENS && messages.length - start >= MIN_TAIL) break
    start--
  }
  return start
}

/** Where the outputs the model has not yet answered with any text start: after its last words. */
function unanswered(messages: readonly SessionMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === 'assistant' && messages[i]!.text.trim()) return i + 1
  return 0
}

/** A message's size in characters, as the model reads it. */
export function chars(m: SessionMessage) {
  let n = m.text.length
  for (const u of m.toolUses) n += u.tool.length + JSON.stringify(u.input).length
  for (const r of m.toolResults ?? []) n += r.text.length
  return n
}
