#!/usr/bin/env node
// The hooks module's tests. `claude plugin test` runs every *.test.ts under the folder it is given,
// and bench/tasks holds the benchmark projects' own acceptance tests, which are not the mod's: so it
// runs on a copy of the plugin without them.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url).pathname
const copy = mkdtempSync(join(tmpdir(), 'tokendoctor-mod-'))
try {
  for (const part of ['.claude-plugin', 'hooks', 'lib', 'tests', 'skills', 'bin', 'templates', 'package.json']) {
    if (existsSync(join(root, part))) cpSync(join(root, part), join(copy, part), { recursive: true })
  }
  const r = spawnSync('claude', ['plugin', 'test', copy], { stdio: 'inherit' })
  process.exitCode = r.status ?? 1
} finally {
  rmSync(copy, { recursive: true, force: true })
}
