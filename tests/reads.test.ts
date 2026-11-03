import { expect, test } from 'claude-code/testing'
import type { ContextCategory, SessionCompacted, SessionContextBreakdown, SessionMessage } from 'claude-code'
import { fileRead } from '../lib/reads.mjs'

const MARKER = 'elided by tokendoctor to save context'

test('plain prints of files are reads; anything piped, redirected, edited or followed is not', async () => {
  expect(fileRead("sed -n '120,180p' src/app.ts")).toEqual(['src/app.ts'])
  expect(fileRead('cd /repo && cat AGENTS.md && cat -n docs/A.md docs/B.md')).toEqual(['AGENTS.md', 'docs/A.md', 'docs/B.md'])
  expect(fileRead('head -50 README.md')).toEqual(['README.md'])
  expect(fileRead('tail -n 20 log.txt')).toEqual(['log.txt'])
  for (const command of [
    'cat f | grep x', "sed -i 's/a/b/' f", "sed -n '/foo/p' f", 'tail -f log', "cat > f <<'EOF'", 'cat *.md',
    'cat AGENTS.md && wc -l docs/STATE.md', 'git diff', 'cat', 'cat -', "python3 - <<'EOF'\nprint(1)\nEOF",
  ]) expect(fileRead(command)).toBe(undefined)
})

// A call and its 20,000-character answer.
function call(id: string, tool: string, input: Record<string, unknown>): SessionMessage[] {
  return [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool, input }], handle: `h-a-${id}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: 'x'.repeat(20_000), isError: false }], handle: `h-r-${id}` },
  ]
}

// Ten reads, then `extra`, at just past 25% of 387K: one 5K output frees enough, so the one that goes
// shows which the slide ranks first.
async function first($: Parameters<Parameters<typeof test>[2]>[0], on: Parameters<Parameters<typeof test>[2]>[1], extra: SessionMessage[], head: SessionMessage[] = []) {
  const messages: SessionMessage[] = [{ role: 'user', text: 'Fix the parser', toolUses: [], handle: 'h-p' }, ...head]
  for (let i = 0; i < 10; i++) messages.push(...call(`t${i}`, 'Read', { file_path: `/repo/src/f${i}.ts` }))
  messages.push(...extra)
  const chars = messages.reduce((n, m) => n + m.text.length + (m.toolResults ?? []).reduce((a, r) => a + r.text.length, 0), 0)
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 96_750 + 3_000, window: 1_000_000,
        breakdown: { rawMaxTokens: 400_000, autoCompactThreshold: 387_000, isAutoCompactEnabled: true,
          categories: [{ name: 'Messages', tokens: chars / 4, kind: 'used' } as ContextCategory] } as SessionContextBreakdown,
      },
      rateLimits: [],
    },
  }))
  on('session.compact', () => ({ messages: [] }) as SessionCompacted)
  const out = (await $.session.compact({ trigger: 'auto', messages })).messages!
  return out.flatMap(m => (m.toolResults ?? []).filter(r => r.text.includes(MARKER)).map(r => ({ id: r.tool_use_id, text: r.text })))
}

test('a Bash print of a file read again later is stale: it goes first, and its pointer names the file', { options: { slide: true } }, async ($, on) => {
  const print = call('cat', 'Bash', { command: "cd /repo && sed -n '1,200p' src/f7.ts" })
  const elided = await first($, on, call('again', 'Read', { file_path: '/repo/src/f7.ts' }), print)
  expect(elided.map(e => e.id)).toEqual(['cat'])
  expect(elided[0]!.text).toContain('Bash print of src/f7.ts')
})

test('a Read made stale by a later Bash print of the same file goes first', { options: { slide: true } }, async ($, on) => {
  const elided = await first($, on, call('cat', 'Bash', { command: 'cat src/f4.ts' }))
  expect(elided.map(e => e.id)).toEqual(['t4'])
})

test('a Bash command that is more than a print is not a read', { options: { slide: true } }, async ($, on) => {
  const piped = call('grep', 'Bash', { command: 'cat src/lexer.ts | grep parse' })
  const elided = await first($, on, call('again', 'Read', { file_path: '/repo/src/lexer.ts' }), piped)
  // Nothing is stale, so the oldest output goes: the piped command, by age alone.
  expect(elided.map(e => e.id)).toEqual(['grep'])
  expect(elided[0]!.text).toContain('Bash output')
})
