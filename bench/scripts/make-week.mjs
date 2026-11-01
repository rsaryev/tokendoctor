#!/usr/bin/env node
// Builds tasks/week: the workday (day 1, seven requests), then six more days in the same session in
// which a colleague's branch is merged over the code: the reference implementation of some modules,
// with bugs in it, which the model is asked to find and fix. The session grows well past what one
// request needs, to 700K and more, as a long week of work does: where a compaction window decides
// the cost, and there is work left after a compaction for it to pay off.
//
// The bugs are mutants of the reference (an operator flipped, a `+ 1` dropped, ...), each kept only
// where it alone fails between 1 and 8 of its module's tests: subtle, but caught. Which mutants go
// into which merge is fixed by a seed, so the task is the same on every machine.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TASKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks')
const DAY = join(TASKS, 'workday')
const OUT = join(TASKS, 'week')
const SCRATCH = join(OUT, '.mutants')
// The mutants found, kept: finding them runs a module's tests once per mutation, many minutes.
const POOL = join(OUT, 'mutants.json')
const FIXED = 'The acceptance tests in test/ are fixed: do not change them, package.json or tsconfig.json.'

const MUTATIONS = [
  [/ <= /g, ' < '], [/ >= /g, ' > '], [/ < /g, ' <= '], [/ > /g, ' >= '],
  [/ === /g, ' !== '], [/ !== /g, ' === '], [/ && /g, ' || '], [/ \|\| /g, ' && '],
  [/ \+ 1\b/g, ''], [/ - 1\b/g, ''], [/\btrue\b/g, 'false'], [/\bfalse\b/g, 'true'],
]

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

const failing = (dir, test) => {
  const out = spawnSync('bun', ['test', test], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  const text = out.stdout + out.stderr
  return { fail: Number(/(\d+) fail/.exec(text)?.[1] ?? 99), pass: Number(/(\d+) pass/.exec(text)?.[1] ?? 0) }
}

const failingAsync = (dir, test) => new Promise((done) => {
  const p = spawn('bun', ['test', test], { cwd: dir })
  let text = ''
  p.stdout.on('data', (d) => (text += d)); p.stderr.on('data', (d) => (text += d))
  const timer = setTimeout(() => p.kill(), 60_000)
  p.on('close', () => {
    clearTimeout(timer)
    done({ fail: Number(/(\d+) fail/.exec(text)?.[1] ?? 99), pass: Number(/(\d+) pass/.exec(text)?.[1] ?? 0) })
  })
})

// Every mutant of a module that its tests catch, but only just: [line, from, to]. Each module in a
// folder of its own, so they are found side by side.
async function mutants(module) {
  const file = join(DAY, 'ref', 'src', `${module}.ts`)
  const lines = readFileSync(file, 'utf8').split('\n')
  const found = []
  const dir = `${SCRATCH}-${module}`
  rmSync(dir, { recursive: true, force: true })
  cpSync(join(DAY, 'ref'), dir, { recursive: true })
  const target = join(dir, 'src', `${module}.ts`)
  for (const [n, line] of lines.entries()) {
    if (/^\s*(\/\/|\*|import|export (type|interface))/.test(line)) continue
    for (const [re, to] of MUTATIONS) {
      for (const m of line.matchAll(re)) {
        const changed = line.slice(0, m.index) + to + line.slice(m.index + m[0].length)
        writeFileSync(target, [...lines.slice(0, n), changed, ...lines.slice(n + 1)].join('\n'))
        const r = await failingAsync(dir, `test/${module}.test.ts`)
        if (r.fail >= 1 && r.fail <= 8 && r.pass > 0) found.push({ module, line: n, changed, fails: r.fail })
      }
    }
  }
  rmSync(dir, { recursive: true, force: true })
  return found
}

// A merge: the named modules as the reference has them, with `per` mutants each on distinct lines,
// none used before.
function merge(name, modules, per, pool, used, next) {
  const dir = join(OUT, 'merges', name)
  mkdirSync(dir, { recursive: true })
  const chosen = []
  for (const module of modules) {
    const lines = readFileSync(join(DAY, 'ref', 'src', `${module}.ts`), 'utf8').split('\n')
    const free = pool[module].filter((m) => !used.has(`${module}:${m.line}`))
    for (let k = 0; k < per && free.length; k++) {
      const [m] = free.splice(Math.floor(next() * free.length), 1)
      if (chosen.some((c) => c.module === module && Math.abs(c.line - m.line) < 2)) { k--; continue }
      used.add(`${module}:${m.line}`)
      chosen.push(m)
      lines[m.line] = m.changed
    }
    writeFileSync(join(dir, `${module}.ts`), lines.join('\n'))
  }
  // All of them together still fail tests (two mutants can cancel out).
  rmSync(SCRATCH, { recursive: true, force: true })
  cpSync(join(DAY, 'ref'), SCRATCH, { recursive: true })
  for (const module of modules) cpSync(join(dir, `${module}.ts`), join(SCRATCH, 'src', `${module}.ts`))
  const r = failing(SCRATCH, '')
  if (!r.fail) throw new Error(`merge ${name} fails no test`)
  return { name, modules, bugs: chosen.length, fails: r.fail }
}

const PART1 = ['money', 'cart', 'csv', 'router', 'lru', 'semver']
const PART2 = ['expr', 'query', 'diff', 'cron']
const ALL = [...PART1, ...PART2]
let pool = existsSync(POOL) ? JSON.parse(readFileSync(POOL, 'utf8')) : null
if (!pool || process.argv.includes('--fresh')) {
  // Four modules at a time: the machine has other work, a benchmark among it.
  const queue = [...ALL].sort((x, y) => (x === 'expr' || x === 'query' ? -1 : 0) - (y === 'expr' || y === 'query' ? -1 : 0))
  pool = {}
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let m; (m = queue.shift()); ) pool[m] = await mutants(m)
  }))
  writeFileSync(POOL, JSON.stringify(pool, null, 1) + '\n')
}
for (const m of ALL) console.log(`${m}: ${pool[m].length} mutants the tests just catch`)

rmSync(join(OUT, 'merges'), { recursive: true, force: true })
const used = new Set()
const next = rng(20261101)
const merges = [
  merge('2a', ['expr', 'query'], 3, pool, used, next),
  merge('2b', ['diff', 'cron'], 3, pool, used, next),
  merge('2c', PART1, 1, pool, used, next),
  merge('3a', ['expr', 'query'], 3, pool, used, next),
  merge('3b', ['diff', 'cron'], 3, pool, used, next),
  merge('3c', PART2, 2, pool, used, next),
  merge('4a', ALL, 1, pool, used, next),
  merge('4b', ['expr', 'query'], 3, pool, used, next),
  merge('5a', ALL, 1, pool, used, next),
  merge('5b', ['diff', 'semver', 'router', 'csv'], 2, pool, used, next),
  merge('6a', ['expr', 'query'], 3, pool, used, next),
  merge('6b', ALL, 1, pool, used, next),
  merge('7a', ALL, 1, pool, used, next),
  merge('7b', ['expr', 'query', 'semver'], 2, pool, used, next),
]
rmSync(SCRATCH, { recursive: true, force: true })

const fix = (m) => ({
  merge: `merges/${m.name}`,
  prompt:
    `A colleague's branch was just merged: it replaced ${m.modules.map((x) => `src/${x}.ts`).join(', ')} with their own ` +
    `implementation, and tests fail now. Find and fix the bugs in their code; do not rewrite the modules from scratch. ` +
    `Check with \`bun test\`; this step is done when every test passes. ${FIXED}`,
})
const day1 = JSON.parse(readFileSync(join(DAY, 'task.json'), 'utf8')).steps.map((prompt) => ({ prompt }))
const whole = { prompt: `Run the whole suite with \`bun test\` and fix whatever fails, until every test passes. ${FIXED}` }
const days = [['2a', '2b', '2c'], ['3a', '3b', '3c'], ['4a', '4b'], ['5a', '5b'], ['6a', '6b'], ['7a', '7b']]
const named = Object.fromEntries(merges.map((m) => [m.name, m]))
const steps = [...day1, ...days.flatMap((day) => [...day.map((n) => fix(named[n])), whole])]

for (const kind of ['project', 'ref']) cpSync(join(DAY, kind), join(OUT, kind), { recursive: true })
const readme = join(OUT, 'project', 'README.md')
writeFileSync(readme, readFileSync(readme, 'utf8').replace('# workday', '# week'))
cpSync(readme, join(OUT, 'ref', 'README.md'))
writeFileSync(join(OUT, 'task.json'), JSON.stringify({ kind: 'implement', steps }, null, 2) + '\n')
for (const m of merges) console.log(`merge ${m.name}: ${m.bugs} bugs in ${m.modules.join(', ')}, ${m.fails} tests fail`)
console.log(`week: ${steps.length} steps`)
