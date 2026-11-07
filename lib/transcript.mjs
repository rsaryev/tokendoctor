// Reading a transcript without holding it whole. A long session's <session>.jsonl passes the longest
// string V8 makes (0x1fffffe8 characters, about 512 MiB): readFileSync(file, 'utf8') throws on it, and
// splitting and parsing it all would hold every tool output in memory at once. So a transcript is read
// in chunks, a line at a time, and each row is kept with only what lib/sessions.mjs and
// lib/dashboard.mjs count: usage figures, timestamps, tool names and sizes, compaction marks.
import { closeSync, openSync, readSync } from 'node:fs'

const CHUNK = 4 << 20

/**
 * The longest line kept, in bytes. Longer ones are skipped: only a tool output, a pasted file or an
 * attachment gets that long. An assistant response, the only line with usage, is bounded by the
 * model's output limit, and compaction marks and cost-state lines are short.
 */
export const LINE_MAX = 64 << 20

/**
 * The lines of a file, decoded as UTF-8, without their newlines, read `chunk` bytes at a time. A line
 * longer than `max` bytes is skipped, counted in `skipped` ({ lines, bytes }) when one is given.
 */
export function* lines(path, { max = LINE_MAX, chunk = CHUNK, skipped } = {}) {
  const fd = openSync(path, 'r')
  const buf = Buffer.allocUnsafe(chunk)
  let carry = [] // the start of a line that runs past the chunk, copied out of it
  let size = 0 // that line's length in bytes so far
  const take = (tail) => {
    const kept = size <= max
    const line = kept ? (carry.length ? Buffer.concat([...carry, tail]).toString('utf8') : tail.toString('utf8')) : null
    if (!kept && skipped) {
      skipped.lines++
      skipped.bytes += size
    }
    carry = []
    size = 0
    return line
  }
  try {
    for (let n; (n = readSync(fd, buf, 0, chunk, null)) > 0; ) {
      const b = buf.subarray(0, n)
      let start = 0
      for (let nl; (nl = b.indexOf(10, start)) !== -1; start = nl + 1) {
        size += nl - start
        const line = take(b.subarray(start, nl))
        if (line !== null) yield line
      }
      size += n - start
      if (size <= max) carry.push(Buffer.from(b.subarray(start)))
      else carry = []
    }
    if (size || carry.length) {
      const line = take(Buffer.alloc(0))
      if (line) yield line
    }
  } finally {
    closeSync(fd)
  }
}

/** A tool result's length in characters; an image counts as 6000. */
export const resultChars = (c) =>
  typeof c.content === 'string' ? c.content.length : Array.isArray(c.content) ? c.content.reduce((n, x) => n + (x?.text?.length ?? (x?.type === 'image' ? 6000 : 0)), 0) : 0

const KEEP = ['type', 'subtype', 'uuid', 'timestamp', 'isSidechain', 'isCompactSummary', 'compactMetadata', 'version', 'effort']

function slimBlock(b) {
  if (!b || typeof b !== 'object') return {}
  if (b.type === 'tool_use') return { type: b.type, id: b.id, name: b.name, input: { command: b.input?.command, file_path: b.input?.file_path } }
  if (b.type === 'tool_result') return { type: b.type, tool_use_id: b.tool_use_id, chars: resultChars(b) }
  return { type: b.type }
}

/**
 * One transcript row with only what is counted: its kind, time, thread and version, a response's id,
 * model and usage, tool calls by name with a Bash command or a Read path, tool results by size, and a
 * compaction's marks. Message text goes, except a compaction summary's, whose length is its cost. A
 * cost-state line is kept whole. Not an object: null.
 */
export function slimRow(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  if (r.type === 'cost-state') return r
  const out = {}
  for (const k of KEEP) if (r[k] !== undefined) out[k] = r[k]
  const m = r.message
  if (m && typeof m === 'object') {
    out.message = { id: m.id, model: m.model, usage: m.usage }
    if (r.isCompactSummary) out.message.content = m.content
    else if (Array.isArray(m.content)) out.message.content = m.content.map(slimBlock)
  }
  return out
}

/** A transcript's rows, slimmed, in order; lines that are not JSON objects are left out. */
export function readRows(path, options) {
  const rows = []
  for (const line of lines(path, options)) {
    if (!line) continue
    let r
    try {
      r = slimRow(JSON.parse(line))
    } catch {
      continue
    }
    if (r) rows.push(r)
  }
  return rows
}

/** Calls `read(path)`; a file that cannot be read (gone, no permission) is left out with a line on stderr. */
export function readOr(path, read, fallback = null) {
  try {
    return read(path)
  } catch (e) {
    process.stderr.write(`tokendoctor: left out ${path}: ${e.message}\n`)
    return fallback
  }
}
