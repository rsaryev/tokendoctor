import { expect, test } from 'claude-code/testing'
import type { ContextCategory, On, SessionCompacted, SessionContextBreakdown, SessionMessage } from 'claude-code'
import { calibrate } from '../hooks/window.ts'

const MARKER = 'elided by tokendoctor to save context'
const THRESHOLD = 387_000

// A conversation of `reads` Read calls, each answered with `output` characters (20,000: 5,000 tokens at
// four characters a token), after one prompt; every message carries a handle as the engine's would.
function conversation(reads: number, output = 20_000, prefix = ''): SessionMessage[] {
  const messages: SessionMessage[] = [{ role: 'user', text: 'Find why the median test fails', toolUses: [], handle: 'h-prompt' }]
  for (let i = 0; i < reads; i++) messages.push(...read(`${prefix}t${i}`, `/src/${prefix}f${i}.py`, output))
  return messages
}

function read(id: string, file: string, output = 20_000): SessionMessage[] {
  return [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool: 'Read', input: { file_path: file } }], handle: `h-a-${id}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: 'x'.repeat(output), isError: false }], handle: `h-r-${id}` },
  ]
}

// An Edit that writes 20,000 characters, and its short answer.
function edit(id: string, file: string): SessionMessage[] {
  return [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool: 'Edit', input: { file_path: file, old_string: 'a', new_string: 'y'.repeat(20_000) } }], handle: `h-${id}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: 'ok', isError: false }], handle: `h-r-${id}` },
  ]
}

const SUMMARY: SessionCompacted = { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }

const size = (ms: readonly SessionMessage[]) =>
  ms.reduce((n, m) => n + m.text.length + m.toolUses.reduce((a, u) => a + u.tool.length + JSON.stringify(u.input).length, 0) + (m.toolResults ?? []).reduce((a, r) => a + r.text.length, 0), 0)

const elidedIds = (ms: readonly SessionMessage[]) =>
  ms.flatMap(m => (m.toolResults ?? []).filter(r => r.text.includes(MARKER)).map(r => r.tool_use_id))

// The session at `tokens`, compacting at 387K, its messages counted at four characters a token.
// Registered once, before the test's first call on $; the returned setter moves it on.
function usage(on: On, messages: readonly SessionMessage[], tokens: number, images = 0) {
  let now = { messages, tokens }
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: now.tokens,
        window: 1_000_000,
        breakdown: {
          rawMaxTokens: 400_000,
          autoCompactThreshold: THRESHOLD,
          isAutoCompactEnabled: true,
          categories: [{ name: 'Messages', tokens: size(now.messages) / 4 + images, kind: 'used' } as ContextCategory],
        } as SessionContextBreakdown,
      },
      rateLimits: [],
    },
  }))
  return (messages: readonly SessionMessage[], tokens: number) => (now = { messages, tokens })
}

test('off by default: the engine compacts as always', async ($, on) => {
  const messages = conversation(76)
  usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  await $.session.compact({ trigger: 'auto', messages })
  expect(summarized).toBe(1)
})

test('on: where Claude Code compacts it elides the oldest outputs down to 25%, with no summary', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const r = await $.session.compact({ trigger: 'auto', messages })
  expect(summarized).toBe(0)
  expect(r.skip).toBe(undefined)
  const out = r.messages!
  expect(out.length).toBe(messages.length)

  // 390K down to 25% of 387K is 293K: about 59 outputs of 5K, the oldest first.
  const elided = elidedIds(out)
  expect(elided.length >= 58 && elided.length <= 60).toBe(true)
  expect(elided).toEqual(elided.map((_, j) => `t${j}`))
  // Every message comes back built anew, so no copy keeps an id a later read of the transcript joins.
  expect(out.every(m => m.handle === undefined)).toBe(true)
  // The prompt, the calls and the recent tail (16K tokens: the last three outputs) stay word for word.
  expect(out[0]!.text).toBe('Find why the median test fails')
  for (let i = 1; i < out.length; i += 2) expect(out[i]!.toolUses).toEqual(messages[i]!.toolUses)
  for (const m of out.slice(-6)) for (const res of m.toolResults ?? []) expect(res.text.length).toBe(20_000)
  // An elided output says what it was, and keeps its pairing with the call.
  const first = out[2]!.toolResults![0]!
  expect(first.tool_use_id).toBe('t0')
  expect(first.text).toContain(`${MARKER}: 20000 characters of Read of /src/f0.py`)
  const { tokensBefore, tokensAfter } = r as SessionCompacted
  expect(tokensBefore).toBe(390_000)
  expect(tokensAfter! <= 96_750).toBe(true)
})

test('a read made stale by a later read of the same file goes first', { options: { slide: true } }, async ($, on) => {
  const messages = [...conversation(10), ...read('again', '/src/f5.py')]
  // Just past 25%: one output of 5K frees enough.
  usage(on, messages, 96_750 + 3_000)
  on('session.compact', () => SUMMARY)
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  expect(elidedIds(out)).toEqual(['t5'])
})

test('what an edit wrote goes before fresh outputs', { options: { slide: true } }, async ($, on) => {
  const messages = [...conversation(10), ...edit('e1', '/src/new.py'), ...conversation(4, 20_000, 'late').slice(1)]
  usage(on, messages, 96_750 + 3_000)
  on('session.compact', () => SUMMARY)
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  const call = out.flatMap(m => m.toolUses).find(u => u.tool_use_id === 'e1')!
  expect(call.input.new_string).toBe(`[${MARKER}: what this wrote is on disk]`)
  expect(call.input.file_path).toBe('/src/new.py')
  expect(elidedIds(out)).toEqual([])
})

test('an edit of a file read earlier makes that read stale: it goes before the edit itself', { options: { slide: true } }, async ($, on) => {
  const messages = [...conversation(10), ...edit('e2', '/src/f3.py'), ...conversation(4, 20_000, 'late').slice(1)]
  usage(on, messages, 96_750 + 3_000)
  on('session.compact', () => SUMMARY)
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  expect(elidedIds(out)).toEqual(['t3'])
  expect(out.flatMap(m => m.toolUses).find(u => u.tool_use_id === 'e2')!.input.new_string).toBe('y'.repeat(20_000))
})

test("a second slide leaves the first one's pointers alone", { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  const set = usage(on, messages, 390_000)
  on('session.compact', () => SUMMARY)
  const once = (await $.session.compact({ trigger: 'auto', messages })).messages!
  const grown = [...once, ...conversation(60, 20_000, 'b').slice(1)]
  set(grown, 390_000)
  const out = (await $.session.compact({ trigger: 'auto', messages: grown })).messages!
  for (let i = 0; i < once.length; i++) if (elidedIds([once[i]!]).length) expect(out[i]).toEqual(once[i])
})

test('the summary computed ahead of time is skipped, /compact still summarizes', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  expect((await $.session.compact({ trigger: 'precompute', messages })).skip).toContain('slides')
  await $.session.compact({ trigger: 'manual', messages })
  expect(summarized).toBe(1)
  // A plugin's $.session.compact asks for a summary as /compact does.
  await $.session.compact({ trigger: 'plugin', messages })
  expect(summarized).toBe(2)
})

test('with nothing worth eliding it falls back to the summary', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(40, 300)
  usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  await $.session.compact({ trigger: 'auto', messages })
  expect(summarized).toBe(1)
})

test('screenshots count as freed: a slide drops them, so it slides where text alone would not', { options: { slide: true } }, async ($, on) => {
  // Little text, as in the summary fallback above, but 200 screenshots (Claude Code names each).
  const messages = conversation(200, 300).map((m, i) =>
    m.toolResults ? { ...m, toolResults: m.toolResults.map(r => ({ ...r, text: `${r.text}\n[Image: source: /tmp/cc/shot-${i}.jpg]` })) } : m,
  )
  usage(on, messages, 390_000, 200 * 1500)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const out = await $.session.compact({ trigger: 'auto', messages })
  expect(summarized).toBe(0)
  expect(out.messages!.length).toBe(messages.length)
  expect(out.messages!.every(m => m.handle === undefined)).toBe(true)
  expect((out as SessionCompacted).tokensAfter! <= 96_750).toBe(true)
})

test('thinking counts as freed too: a message handed back rebuilt carries none', { options: { slide: true } }, async ($, on) => {
  // As Haiku on evalkit: one long task, little text, and answers that thought 40K tokens each.
  const messages = conversation(40, 1_000)
  usage(on, messages, 390_000, 360_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const out = await $.session.compact({ trigger: 'auto', messages })
  expect(summarized).toBe(0)
  expect((out as SessionCompacted).tokensAfter! <= 0.6 * THRESHOLD).toBe(true)
})

test('after a summary the next compaction slides again', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  const move = usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const once = (await $.session.compact({ trigger: 'auto', messages })).messages!
  // Back at the window two steps later: summarized, as above.
  await $.session.compact({ trigger: 'auto', messages: [...once, ...read('n1', '/src/n.py')] })
  expect(summarized).toBe(1)
  // The summary left one message; 30 large reads after it (fewer messages than the slide left) compact again, and slide.
  const later = [SUMMARY.messages![0]!, ...conversation(30, 50_000, 'l').slice(1)]
  move(later, 390_000)
  await $.session.compact({ trigger: 'auto', messages: later })
  expect(summarized).toBe(1)
})

test('Agent results are never elided', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  messages.splice(1, 0,
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'ag', tool: 'Agent', input: { prompt: 'look' } }], handle: 'h-ag' },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'ag', text: 'y'.repeat(20_000), isError: false }], handle: 'h-agr' },
  )
  usage(on, messages, 395_000)
  on('session.compact', () => SUMMARY)
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  expect(out[2]!.toolResults![0]!.text).toBe('y'.repeat(20_000))
})

test('back at the window within a few steps of a slide, the summary takes over', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const once = (await $.session.compact({ trigger: 'auto', messages })).messages!
  await $.session.compact({ trigger: 'auto', messages: [...once, ...read('n1', '/src/n.py')] })
  expect(summarized).toBe(1)
})

test('copies of earlier compactions handed back are dropped before sliding', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  // Every old message four times over, as Claude Code handed it back after three slides.
  const copied = [messages[0]!, ...messages.slice(1, 41).flatMap(m => [m, m, m, m].map((c, n) => ({ ...c, handle: `${c.handle}-${n}` }))), ...messages.slice(41)]
  usage(on, messages, 390_000)
  on('session.compact', () => SUMMARY)
  const out = (await $.session.compact({ trigger: 'auto', messages: copied })).messages!
  expect(out.length).toBe(messages.length)
  expect(new Set(out.flatMap(m => m.toolUses.map(u => u.tool_use_id))).size).toBe(76)
})

test('outputs the model has not answered with a word yet stay, short of 25% if it must', { options: { slide: true } }, async ($, on) => {
  const early = conversation(34)
  early[early.length - 2] = { ...early[early.length - 2]!, text: 'ok, noted' }
  // A new question, then five reads in a row with no words between them.
  const messages = [...early, { role: 'user', text: 'What are the colors?', toolUses: [] } as SessionMessage, ...conversation(5, 20_000, 'q').slice(1)]
  // At 387K, 25% (96,750) needs 290K freed, more than all there is. All but the last of the 34 older outputs give 163K:
  // under 60% of where Claude Code compacts (232K), so they go and the fresh reads stay.
  usage(on, messages, 387_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  expect(summarized).toBe(0)
  expect(elidedIds(out)).toEqual(early.flatMap(m => m.toolUses.map(u => u.tool_use_id)).slice(0, -1))
})

test('a screenshot elided keeps the name of the file Claude Code saved it to', { options: { slide: true } }, async ($, on) => {
  const messages = conversation(76)
  const shot = '[Image: source: /tmp/cc/tool-results/desk-blob-1.jpg]'
  messages[2] = { ...messages[2]!, toolResults: [{ tool_use_id: 't0', text: `Screenshot of the page.\n${'p'.repeat(20_000)}\n${shot}`, isError: false }] }
  usage(on, messages, 390_000)
  on('session.compact', () => SUMMARY)
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  const pointer = out[2]!.toolResults![0]!.text
  expect(pointer.includes(MARKER)).toBe(true)
  expect(pointer.includes(shot)).toBe(true)
})

// Turns of talk with little to elide: each a prompt, a long answer and one small read.
function talk(turns: number): SessionMessage[] {
  const messages: SessionMessage[] = []
  for (let i = 0; i < turns; i++) {
    messages.push(
      { role: 'user', text: `step ${i}: change the parser ${'p'.repeat(4_000)}`, toolUses: [], handle: `h-p${i}` },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: `r${i}`, tool: 'Read', input: { file_path: `/src/m${i}.ts` } }], handle: `h-u${i}` },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `r${i}`, text: 'short', isError: false }], handle: `h-res${i}` },
      { role: 'assistant', text: `done ${i} ${'a'.repeat(30_000)}`, toolUses: [], handle: `h-a${i}` },
    )
  }
  return messages
}

test('where eliding is not enough, the oldest turns go whole with a card, not a summary', { options: { slide: true } }, async ($, on) => {
  const messages = talk(46)
  usage(on, messages, 390_000)
  let summarized = 0
  on('session.compact', () => (summarized++, SUMMARY))
  const r = (await $.session.compact({ trigger: 'auto', messages })) as SessionCompacted
  const out = r.messages!
  expect(summarized).toBe(0)
  expect(out.length).toBeLessThan(messages.length)
  expect(out[0]!.role).toBe('user')
  expect(out[0]!.text.startsWith('[tokendoctor removed the')).toBe(true)
  expect(out[0]!.text.includes('- step 0: change the parser')).toBe(true)
  expect(out[0]!.text.includes('Files read: ') && out[0]!.text.includes('/src/m10.ts')).toBe(true)
  // No result is left without its call.
  const calls = new Set(out.flatMap(m => m.toolUses.map(u => u.tool_use_id)))
  expect(out.every(m => (m.toolResults ?? []).every(res => calls.has(res.tool_use_id)))).toBe(true)
  expect(out.at(-1)!.text).toBe(messages.at(-1)!.text)
  expect(r.tokensAfter! <= 96_750).toBe(true)
})

test('the estimate learns what Claude Code adds back, as a moving average', async () => {
  expect(calibrate(undefined, 80_000)).toBe(80_000)
  expect(calibrate(80_000, 120_000)).toBe(94_000)
  expect(calibrate(10_000, -50_000)).toBe(0)
  expect(calibrate(undefined, 900_000)).toBe(200_000)
})
