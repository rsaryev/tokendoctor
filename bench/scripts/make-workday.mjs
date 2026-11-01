#!/usr/bin/env node
// Builds tasks/workday from shopkit and evalkit: one project of ten modules (307 tests), asked for
// in seven requests in one session, as a day of work: shopkit's six modules in two, evalkit's four
// one by one, then the whole suite. The session grows past what one request needs, which is where
// a compaction window, a summary or a slide decide the cost.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TASKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks')
const OUT = join(TASKS, 'workday')
const FIXED = 'The acceptance tests in test/ are fixed: do not change them, package.json or tsconfig.json.'

const tests = (mods) => mods.map((m) => `test/${m}.test.ts`).join(' ')
const step = (mods, what) =>
  `${what} Check with \`bun test ${tests(mods)}\`; this step is done when those pass. ${FIXED}`
const STEPS = [
  step(['money', 'cart', 'csv'], 'Implement src/money.ts, src/cart.ts and src/csv.ts as README.md specifies (part 1).'),
  step(['router', 'lru', 'semver'], 'Now implement src/router.ts, src/lru.ts and src/semver.ts as README.md specifies (part 1).'),
  step(['expr'], 'Next, src/expr.ts, the expression language of README.md part 2.'),
  step(['query'], 'Next, src/query.ts, SQL over arrays of objects (README.md part 2).'),
  step(['diff'], 'Next, src/diff.ts, line diffs, unified diffs and patches (README.md part 2).'),
  step(['cron'], 'Next, src/cron.ts, five-field cron in UTC (README.md part 2).'),
  `Run the whole suite with \`bun test\` and fix whatever fails, in any module, until every test passes. ${FIXED} ` +
    'Then say in a line for each module what it does.',
]

function readme(kind) {
  const shop = readFileSync(join(TASKS, 'shopkit', kind, 'README.md'), 'utf8')
  const evalkit = readFileSync(join(TASKS, 'evalkit', kind, 'README.md'), 'utf8')
  const demote = (text) => text.replace(/^(#{2,}) /gm, '#$1 ')
  const part1 = demote(shop.slice(shop.indexOf('## `src/money.ts`')))
  const part2 = demote(evalkit.slice(evalkit.indexOf('Rules for the work:')))
  return [
    '# workday',
    '',
    'Ten TypeScript modules in `src/`, each a stub that throws until it is implemented. The tests in',
    '`test/` are the acceptance tests: they are fixed and must not be changed. Run `bun test` for',
    'everything, or `bun test test/<module>.test.ts` for one module.',
    '',
    '## Part 1: six small modules',
    '',
    'Every function is exported by name.',
    '',
    part1.trim(),
    '',
    '## Part 2: four libraries, specified exactly',
    '',
    part2.trim(),
    '',
  ].join('\n')
}

rmSync(OUT, { recursive: true, force: true })
for (const kind of ['project', 'ref']) {
  const dir = join(OUT, kind)
  mkdirSync(dir, { recursive: true })
  for (const from of ['shopkit', 'evalkit']) {
    cpSync(join(TASKS, from, kind, 'src'), join(dir, 'src'), { recursive: true })
    cpSync(join(TASKS, from, kind, 'test'), join(dir, 'test'), { recursive: true })
  }
  cpSync(join(TASKS, 'evalkit', kind, 'tsconfig.json'), join(dir, 'tsconfig.json'))
  writeFileSync(join(dir, 'package.json'), '{ "name": "workday", "private": true, "type": "module", "scripts": { "test": "bun test" } }\n')
  writeFileSync(join(dir, 'README.md'), readme(kind))
}
writeFileSync(join(OUT, 'task.json'), JSON.stringify({ kind: 'implement', steps: STEPS }, null, 2) + '\n')
console.log(`workday: ${STEPS.length} steps`)
