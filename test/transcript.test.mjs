import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { collect } from '../lib/dashboard.mjs'
import { parseDebugLog } from '../lib/debuglog.mjs'
import { analyzeSession } from '../lib/sessions.mjs'
import { LINE_MAX, lines, readOr, readRows } from '../lib/transcript.mjs'

const tmp = () => mkdtempSync(join(tmpdir(), 'td-transcript-'))
const bin = (name) => new URL(`../bin/${name}`, import.meta.url).pathname

/** V8's longest string, in characters (0x1fffffe8): readFileSync(file, 'utf8') throws past it. */
const LONGEST_STRING = 0x1fffffe8

test('lines across chunk boundaries match split, multi-byte characters and empty lines included', () => {
  const dir = tmp()
  const texts = ['', '\n', 'a', 'a\n', 'a\n\nb', 'строка\n🧪 emoji\n\n{"k":"ü"}\nlast', 'x'.repeat(40) + '\n' + 'й'.repeat(13) + '\n']
  for (const [i, text] of texts.entries()) {
    const file = join(dir, `${i}.txt`)
    writeFileSync(file, text)
    const want = text ? text.split('\n') : []
    if (text.endsWith('\n')) want.pop()
    for (const chunk of [1, 2, 3, 5, 7, 64]) assert.deepEqual([...lines(file, { chunk })], want, `${JSON.stringify(text)} in chunks of ${chunk}`)
  }
  rmSync(dir, { recursive: true })
})

test('a line past the limit is skipped and counted, its neighbours whole', () => {
  const dir = tmp()
  const file = join(dir, 't.txt')
  writeFileSync(file, ['short', 'é'.repeat(5), 'x'.repeat(11), 'y'.repeat(10), 'end'].join('\n'))
  for (const chunk of [1, 4, 1024]) {
    const skipped = { lines: 0, bytes: 0 }
    // 'é' is two bytes: five of them are ten bytes, at the limit and kept.
    assert.deepEqual([...lines(file, { max: 10, chunk, skipped })], ['short', 'é'.repeat(5), 'y'.repeat(10), 'end'])
    assert.deepEqual(skipped, { lines: 1, bytes: 11 })
  }
  rmSync(dir, { recursive: true })
})

// A session with every kind of row the readers look at, and some they do not.
const at = (m) => new Date(Date.UTC(2026, 9, 1, 0, m)).toISOString()
const usage = (read, write, out = 100) => ({ input_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out })
const ROWS = [
  { type: 'queue-operation', timestamp: at(0), content: 'secret queued prompt' },
  { type: 'user', timestamp: at(0), uuid: 'u0', message: { role: 'user', content: 'secret prompt text' } },
  { type: 'assistant', timestamp: at(1), uuid: 'a1', effort: 'high', version: '2.1.300', message: { id: 'm1', model: 'claude-opus-5-5', usage: usage(30000, 30000), content: [{ type: 'text', text: 'secret answer' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/p/a.ts' } }] } },
  { type: 'user', timestamp: at(1), toolUseResult: { file: { content: 'secret file' } }, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'secret file body' }] } },
  { type: 'assistant', timestamp: at(2), uuid: 'a2', version: '2.1.300', message: { id: 'm2', model: 'claude-opus-5-5', usage: usage(60000, 1000), content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'cat /p/b.ts', description: 'secret' } }] } },
  { type: 'assistant', timestamp: at(2), uuid: 'a2b', version: '2.1.300', message: { id: 'm2', model: 'claude-opus-5-5', usage: usage(60000, 1000), content: [{ type: 'thinking', thinking: 'secret thought' }] } },
  { type: 'user', timestamp: at(2), message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'secret printed' }, { type: 'image', source: { data: 'AAAA' } }] }] } },
  { type: 'api-request-blob', hash: 'h', message: { content: [{ type: 'text', text: 'secret blob' }] } },
  { type: 'attachment', timestamp: at(3), attachment: { type: 'file', content: 'secret attachment' } },
  { type: 'cost-state', sessionId: 's', totalCostUSD: 0.5, startTime: Date.parse(at(0)), hasUnknownModelCost: false },
  { type: 'system', subtype: 'compact_boundary', timestamp: at(4), content: 'Conversation compacted', compactMetadata: { trigger: 'auto', preTokens: 150000 } },
  { type: 'user', timestamp: at(4), isCompactSummary: true, message: { content: 'This session is being continued: the summary.' } },
  { type: 'assistant', timestamp: at(5), uuid: 'a3', version: '2.1.301', message: { id: 'm3', model: 'claude-opus-5-5', usage: usage(1000, 40000), content: [{ type: 'tool_use', id: 't3', name: 'Read', input: { file_path: '/p/a.ts' } }] } },
  { type: 'user', timestamp: at(5), message: { content: [{ type: 'tool_result', tool_use_id: 't3', content: [{ type: 'text', text: 'secret again' }] }] } },
  { type: 'assistant', timestamp: at(6), uuid: 'a4', isSidechain: true, message: { id: 'm4', model: 'claude-haiku-5-5', usage: usage(0, 500), content: [] } },
  { type: 'cost-state', sessionId: 's', totalCostUSD: 0.9, startTime: Date.parse(at(0)), hasUnknownModelCost: false },
]
const SUB = [
  { type: 'assistant', timestamp: at(3), message: { id: 's1', model: 'claude-haiku-5-5', usage: usage(0, 2000), content: [{ type: 'tool_use', id: 'st', name: 'Grep', input: { pattern: 'secret' } }] } },
  { type: 'user', timestamp: at(3), message: { content: [{ type: 'tool_result', tool_use_id: 'st', content: 'secret match' }] } },
]

test('a transcript read from disk counts the same as the whole rows and keeps no text', () => {
  const dir = tmp()
  const main = join(dir, 's.jsonl')
  const sub = join(dir, 'a.jsonl')
  writeFileSync(main, [...ROWS.map((r) => JSON.stringify(r)), 'not json', 'null', '42', '[1]', ''].join('\n'))
  writeFileSync(sub, SUB.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const rows = readRows(main)
  assert.equal(rows.length, ROWS.length, 'every object is a row, so a row after a compaction mark stays where it was')
  assert.deepEqual(analyzeSession(rows, [{ type: 'Explore', rows: readRows(sub) }]), analyzeSession(ROWS, [{ type: 'Explore', rows: SUB }]))
  const s = analyzeSession(rows)
  assert.equal(s.compactions[0].rereads, 1)
  assert.equal(s.tools.main.bash.fileReadChars, 'secret printed'.length + 6000)
  assert.ok(!JSON.stringify(rows).includes('secret'))
  rmSync(dir, { recursive: true })
})

test('readOr leaves out a file it cannot read and says which', () => {
  const dir = tmp()
  const said = []
  const write = process.stderr.write
  process.stderr.write = (s) => said.push(String(s))
  try {
    assert.equal(readOr(join(dir, 'gone.jsonl'), readRows), null)
    assert.deepEqual(readOr(dir, readRows, []), [], 'a folder is no transcript')
  } finally {
    process.stderr.write = write
  }
  assert.equal(said.length, 2)
  assert.match(said[0], /^tokendoctor: left out .*gone\.jsonl: ENOENT/)
  rmSync(dir, { recursive: true })
})

test('a debug log read by lines parses as the whole text does', () => {
  const dir = tmp()
  const file = join(dir, 'debug.txt')
  const text = [
    '2026-11-06T01:26:35.308Z [DEBUG] cc-plugin-sec-default@builtin seated outermost: this machine has managed settings',
    '2026-11-06T01:26:35.308Z [DEBUG] hooks module tokendoctor@tokendoctor loaded (worker, environment 1, tier user); events: tool.call,session.start,session.compact',
    '2026-11-06T01:26:35.308Z [ERROR] something failed',
    '2026-11-06T01:26:35.308Z [DEBUG] autocompact: tokens=[REDACTED] level=ok effectiveWindow=480000',
    '2026-11-06T01:26:35.308Z [DEBUG] User-Agent: claude-code/2.1.318 (sdk-cli)',
  ].join('\n')
  writeFileSync(file, text)
  assert.deepEqual(parseDebugLog(lines(file, { chunk: 16 })), parseDebugLog(text))
  rmSync(dir, { recursive: true })
})

// The report from Reddit: a 782 MB transcript of the session itself, "too big for Node to read in
// one go". The file here is longer than the longest string, mostly a hole (sparse, no disk): its
// lines on both sides of the hole count, and the hole, one line past LINE_MAX, is skipped.
test('a transcript longer than the longest string Node makes is read, by every report', () => {
  const dir = tmp()
  const project = join(dir, 'projects', '-x-proj')
  mkdirSync(project, { recursive: true })
  const file = join(project, 's1.jsonl')
  const day = new Date(Date.now() - 60e3).toISOString()
  const resp = (id) => JSON.stringify({ type: 'assistant', timestamp: day, message: { id, model: 'claude-opus-5-5', usage: usage(1000, 0), content: [] } })
  writeFileSync(file, `${resp('m1')}\n${resp('m2')}\n`)
  truncateSync(file, statSync(file).size + LONGEST_STRING + 1)
  appendFileSync(file, `\n${resp('m3')}\n`)
  assert.ok(statSync(file).size > LONGEST_STRING && LONGEST_STRING > LINE_MAX)
  // A folder named like a transcript cannot be read: it is left out, the rest still counts.
  mkdirSync(join(project, 'broken.jsonl'))

  const env = { ...process.env, CLAUDE_CONFIG_DIR: dir }
  const sessions = spawnSync(process.execPath, [bin('tokendoctor-sessions'), '--days', '1', '--json'], { env, encoding: 'utf8' })
  assert.equal(sessions.status, 0, sessions.stderr)
  assert.equal(JSON.parse(sessions.stdout).topSessions[0].turns, 3)
  assert.match(sessions.stderr, /left out .*broken\.jsonl/)
  const replay = spawnSync(process.execPath, [bin('tokendoctor-replay'), '--days', '1', '--json'], { env, encoding: 'utf8' })
  assert.equal(replay.status, 0, replay.stderr)
  assert.equal(JSON.parse(replay.stdout).sessions, 1)
  const d = collect(dir, { days: 1 })
  assert.equal(d.sessions[0].requests, 3)
  rmSync(dir, { recursive: true })
})
