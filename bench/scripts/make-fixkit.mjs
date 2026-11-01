#!/usr/bin/env node
// Builds tasks/fixkit from tasks/evalkit/ref: the same four libraries, finished, with twelve bugs put
// in (three a module), and a README that asks for them to be found and fixed. The reference is
// evalkit's own. Each bug alone fails at least one test; `node bench/scripts/make-fixkit.mjs` checks
// that and writes the task again.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TASKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks')
const REF = join(TASKS, 'evalkit', 'ref')
const OUT = join(TASKS, 'fixkit')

export const BUGS = [
  ['cron.ts', 'hi = stepText === undefined ? lo : f.top;', 'hi = lo;'],
  ['cron.ts', 'return s.dayOfMonthStar || s.dayOfWeekStar ? dom && dow : dom || dow;', 'return s.dayOfMonthStar || s.dayOfWeekStar ? dom || dow : dom && dow;'],
  ['cron.ts', 'set.add(f.name === "day-of-week" && v === 7 ? 0 : v)', 'set.add(v)'],
  ['diff.ts', 'changes[d]! - last - 1 <= 2 * context', 'changes[d]! - last - 1 < 2 * context'],
  ['diff.ts', 'const aStart = aLen === 0 ? pos[from]!.i : pos[from]!.i + 1;', 'const aStart = pos[from]!.i + 1;'],
  ['diff.ts', 'let idx = h.oldLen === 0 ? h.oldStart : h.oldStart - 1;', 'let idx = h.oldStart - 1;'],
  ['query.ts', 'order(v, lo) >= 0;', 'order(v, lo) > 0;'],
  ['query.ts', 'return r === 0 ? null : l % r;', 'return l % r;'],
  ['query.ts', 'return { kind: "out", index: e.v - 1, desc: o.desc };', 'return { kind: "out", index: e.v, desc: o.desc };'],
  ['expr.ts', 'n.op === "<=" ? l <= r', 'n.op === "<=" ? l < r'],
  ['expr.ts', 'if (2n * rem > div || (2n * rem === div && q % 2n === 1n)) q += 1n;', 'if (2n * rem >= div) q += 1n;'],
  ['expr.ts', '(isObj(x!) ? Object.keys(x).sort() :', '(isObj(x!) ? Object.keys(x) :'],
]

const INTRO_FROM = /Four small TypeScript libraries, specified exactly\. Each `src\/\*\.ts` file is a stub:[^]*?Implement them so that `bun test` passes\./
const INTRO_TO =
  'Four small TypeScript libraries, specified exactly. Each `src/*.ts` file is finished, but the\n' +
  'libraries have bugs: some tests fail. Find and fix them so that `bun test` passes.'

const failing = (dir) => {
  const out = spawnSync('bun', ['test'], { cwd: dir, encoding: 'utf8' })
  return Number(/(\d+) fail/.exec(out.stdout + out.stderr)?.[1] ?? 0)
}

function build(dir, bugs) {
  rmSync(dir, { recursive: true, force: true })
  cpSync(REF, dir, { recursive: true })
  for (const [file, from, to] of bugs) {
    const path = join(dir, 'src', file)
    const text = readFileSync(path, 'utf8')
    if (text.split(from).length !== 2) throw new Error(`${file}: "${from}" is not there exactly once`)
    writeFileSync(path, text.replace(from, to))
  }
}

rmSync(OUT, { recursive: true, force: true })
cpSync(REF, join(OUT, 'ref'), { recursive: true })
const scratch = join(OUT, '.one')
for (const bug of BUGS) {
  build(scratch, [bug])
  const n = failing(scratch)
  console.log(`${String(n).padStart(3)} failing  ${bug[0]}: ${bug[1]}`)
  if (!n) throw new Error('this bug fails no test')
}
rmSync(scratch, { recursive: true, force: true })
build(join(OUT, 'project'), BUGS)
const readme = join(OUT, 'project', 'README.md')
const text = readFileSync(readme, 'utf8').replace('# evalkit', '# fixkit')
if (!INTRO_FROM.test(text)) throw new Error('README intro not found')
writeFileSync(readme, text.replace(INTRO_FROM, INTRO_TO))
cpSync(readme, join(OUT, 'ref', 'README.md'))
console.log(`fixkit: ${failing(join(OUT, 'project'))} tests fail with all twelve bugs`)
