import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  ...readdirSync(join(root, 'templates', 'agents')).map((f) => join(root, 'templates', 'agents', f)),
  ...readdirSync(join(root, 'skills')).map((d) => join(root, 'skills', d, 'SKILL.md')),
]

// GitHub and strict YAML parsers reject an unquoted value that contains ": " or " #".
// Claude Code is more forgiving, so a file can work locally and still fail to render elsewhere.
test('frontmatter values are valid plain YAML scalars', () => {
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.ok(text.startsWith('---\n'), `${file} starts with frontmatter`)
    const head = text.slice(4, text.indexOf('\n---', 4))
    for (const line of head.split('\n')) {
      const m = /^([A-Za-z][\w-]*):\s+(.*)$/.exec(line)
      assert.ok(m, `${file}: "${line}" is a key: value line`)
      const value = m[2]
      if (/^["'[{|>]/.test(value)) continue
      assert.doesNotMatch(value, /: | #/, `${file}: unquoted value of "${m[1]}" contains ": " or " #"`)
    }
  }
})
