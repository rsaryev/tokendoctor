// Nothing git would take names a person's machine or holds a secret: no API key or OAuth token, no
// home folder path, no temporary folder of a run. Benchmark results are written by Claude Code runs
// on someone's account; this is the net under them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean).filter((f) => !f.startsWith('test/private.test.mjs'))

const SECRETS = [
  [/sk-ant-[a-z]{2,4}\d{0,2}-[A-Za-z0-9_-]{20,}/, 'an Anthropic key or token'],
  [/CLAUDE_CODE_OAUTH_TOKEN=\S{8,}/, 'an OAuth token'],
  [/\/Users\/[a-z][\w.-]+\/(?!\.\.\.)/, 'a home folder path'],
  [/\/home\/(?!user\/|runner\/)[a-z][\w.-]+\//, 'a home folder path'],
  [/\/var\/folders\/[\w+-]{2}\/[\w+-]{20,}/, 'a temporary folder of this machine'],
]

test('nothing git would take holds a secret or a path of this machine', () => {
  const found = []
  for (const f of files) {
    try { if (statSync(new URL(f, `file://${ROOT}`)).size > 5_000_000) continue } catch { continue }
    const text = readFileSync(new URL(f, `file://${ROOT}`), 'utf8')
    for (const [re, what] of SECRETS) {
      const m = re.exec(text)
      if (m) found.push(`${f}: ${what} (${m[0].slice(0, 24)}…)`)
    }
  }
  assert.deepEqual(found, [])
})
