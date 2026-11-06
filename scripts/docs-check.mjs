#!/usr/bin/env node
// For whoever maintains tokendoctor: every settings key and environment variable it reads, writes
// or advises on, checked against Claude Code's current docs (lib/docs.mjs fetches them, a day's
// cache). A name the docs dropped or renamed shows here before a person's audit gets it wrong.
// Network; not part of `npm test`. Usage: npm run docs:check [-- --offline]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { docsIndex, loadDocs } from '../lib/docs.mjs'
import { TUNABLES } from '../lib/tunables.mjs'

const root = new URL('..', import.meta.url).pathname
const docs = await loadDocs(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'tokendoctor', 'docs'), { offline: process.argv.includes('--offline') })
const index = docsIndex(docs.pages)
if (!index) {
  console.error('The docs could not be read.')
  process.exit(2)
}

const settings = new Set()
const env = new Set()
for (const [key, t] of Object.entries(TUNABLES)) {
  const path = t.path ?? key
  if (path.startsWith('env.')) env.add(path.slice(4))
  else if (!path.startsWith('pluginConfigs.')) settings.add(path.split('.')[0])
}
const source = ['lib/collect.mjs', 'lib/rules.mjs', 'lib/sessions.mjs', 'templates/statusline.sh'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n')
for (const m of source.matchAll(/settings\[\w+\]\.([a-zA-Z]+)/g)) settings.add(m[1])
for (const m of source.matchAll(/['"`]((?:CLAUDE|ANTHROPIC|DISABLE|ENABLE|MAX|BASH|FORCE)_[A-Z0-9_]+)['"`]/g)) env.add(m[1])
// Named on purpose because Claude Code does not have them (a rule says so).
const notKeys = new Set(['autoCompactThreshold'])
const missing = [
  ...[...settings].filter((k) => !notKeys.has(k) && !index.settings.has(k)).map((k) => `setting ${k}`),
  ...[...env].filter((k) => !index.env.has(k)).map((k) => `env ${k}`),
]
console.log(`Docs read ${docs.fetchedAt}${docs.stale ? ' (stale cache)' : ''}: ${index.settings.size} settings keys, ${index.env.size} variables.`)
console.log(`tokendoctor names ${settings.size} settings keys and ${env.size} variables.`)
if (!missing.length) console.log('All of them are in the docs.')
else {
  console.log(`Not in the docs (renamed, removed, or never documented):\n  ${missing.join('\n  ')}`)
  process.exitCode = 1
}
