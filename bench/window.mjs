#!/usr/bin/env node
// Benchmarks tokendoctor's slide against Claude Code's own compaction on real `claude -p` sessions.
//
// Each run reads N files one by one, noting each file's KEY in its replies (its own findings), then a
// follow-up in the same session (--resume) asks for two early KEYs (kept only if the conversation
// remembers) and three COLORs that were never noted (only in the tool outputs: re-read or recalled).
// Every arm gets the same files per repetition.
//
// --task recall measures what a summary loses: the session starts with six project decisions from
// the person, then reads the files, then the files are deleted and the follow-up asks for the
// decisions and eight KEYs the model noted along the way. Only the conversation can answer.
// Usage:
//   node bench/window.mjs [--task read|recall] [--reps 3] [--files 40] [--lines 190] [--window 100000]
//                         [--model claude-haiku-5-5] [--arms compact,slide25,slide40] [--jobs 3] [--out bench/results]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const TASK = arg('task', 'read')
const REPS = Number(arg('reps', 3))
const FILES = Number(arg('files', 40))
const LINES = Number(arg('lines', 190))
const WINDOW = Number(arg('window', 100000))
const MODEL = arg('model', 'claude-haiku-5-5')
const JOBS = Number(arg('jobs', 3))
const OUT = arg('out', 'bench/results')
const ARMS = {
  compact: { slide: false },
  slide25: { slide: true, slideTo: 25 },
  slide40: { slide: true, slideTo: 40 },
  slide60: { slide: true, slideTo: 60 },
}
const arms = arg('arms', 'compact,slide25,slide40').split(',')

const WORDS = 'alpha beta gamma delta epsilon zeta theta kappa lambda sigma omega river stone cloud ember frost metal paper glass night'.split(' ')
const COLORS = 'red orange yellow green teal blue indigo violet amber coral ivory olive'.split(' ')

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

// N files of LINES lines, each with a KEY and a COLOR line at a random place; the truth.
function fixtures(dir, seed) {
  const r = rng(seed)
  const pick = list => list[Math.floor(r() * list.length)]
  const truth = { keys: {}, colors: {} }
  for (let i = 1; i <= FILES; i++) {
    const id = String(i).padStart(2, '0')
    truth.keys[id] = `${pick(WORDS)}-${Math.floor(r() * 900 + 100)}`
    truth.colors[id] = pick(COLORS)
    const lines = []
    for (let j = 0; j < LINES; j++) lines.push(`${String(j).padStart(4, '0')} ${Array.from({ length: 8 }, () => pick(WORDS)).join(' ')}`)
    lines.splice(Math.floor(r() * (LINES - 10)) + 5, 0, `KEY part${id} = ${truth.keys[id]}`)
    lines.splice(Math.floor(r() * (LINES - 10)) + 5, 0, `COLOR part${id} = ${truth.colors[id]}`)
    writeFileSync(join(dir, `part${id}.txt`), `# part ${id}\n${lines.join('\n')}\n`)
  }
  return truth
}

const pad = n => String(n).padStart(2, '0')
const ASK_KEYS = [pad(2), pad(Math.ceil(FILES / 4))]
const ASK_COLORS = [pad(3), pad(Math.ceil(FILES / 2)), pad(FILES - 6)]

const READ_ALL =
  `Read part01.txt, part02.txt, ... part${pad(FILES)}.txt with the Read tool, strictly one file per tool call. ` +
  `Every response after a read holds exactly two things: one line "ok NN KEY" for the file just read (KEY is the value on its KEY line), ` +
  `then the Read call for the next file. Never end a response without a Read call until all ${FILES} files are read; then reply "done".`
const FOLLOW_UP =
  `Answer with one JSON line and nothing else: {"keys": {${ASK_KEYS.map(k => `"${k}": "<KEY of part${k}.txt>"`).join(', ')}}, ` +
  `"colors": {${ASK_COLORS.map(k => `"${k}": "<COLOR of part${k}.txt>"`).join(', ')}}}. You may use tools.`

// The person's decisions at the start of a recall run: arbitrary, so nothing but the conversation knows them.
function decisions(seed) {
  const r = rng(seed * 7 + 3)
  const pick = list => list[Math.floor(r() * list.length)]
  return {
    codename: `${pick(WORDS)}-${pick(WORDS)}-${Math.floor(r() * 900 + 100)}`,
    port: String(Math.floor(r() * 5000 + 3000)),
    owner: pick(['Mirela', 'Tobin', 'Asha', 'Kenji', 'Ruslan', 'Ines', 'Dario', 'Leilani']),
    rejected: pick(['lodash', 'moment', 'axios', 'redux', 'jquery', 'rxjs']),
    reason: pick(['bundle size', 'license', 'no ESM build', 'abandoned upstream', 'slow cold start']),
    flag: `ff_${pick(WORDS)}_${pick(WORDS)}`,
  }
}
const BRIEF = d =>
  `Before the task, five decisions for this project. Remember them, I will ask later. Reply only "noted".\n` +
  `- The release codename is ${d.codename}.\n- Staging runs on port ${d.port}.\n- ${d.owner} owns the billing module.\n` +
  `- We decided against ${d.rejected} because of ${d.reason}.\n- The new reader ships behind the feature flag ${d.flag}.`
const RECALL_KEYS = Array.from({ length: 8 }, (_, k) => pad(Math.round((FILES * (k + 0.5)) / 8)))
const RECALL =
  `Answer with one JSON line and nothing else, from this conversation alone (the files are gone): ` +
  `{"decisions": {"codename": "", "port": "", "owner": "", "rejected": "<library>", "reason": "", "flag": ""}, ` +
  `"keys": {${RECALL_KEYS.map(k => `"${k}": "<KEY of part${k}.txt>"`).join(', ')}}}. Write "unknown" for what you do not know.`

function claude(cwd, args) {
  return new Promise(resolve => {
    const p = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('close', code => {
      try {
        resolve(JSON.parse(out))
      } catch {
        resolve({ is_error: true, result: `exit ${code}: ${(err || out).slice(0, 300)}` })
      }
    })
  })
}

function transcript(sessionId) {
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
  for (const d of readdirSync(root)) {
    const f = join(root, d, `${sessionId}.jsonl`)
    if (existsSync(f)) return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  }
  return []
}

// What the transcript says: requests' token counts (each response counted once), split at the
// follow-up; compactions; Read calls and re-reads; the KEYs noted in replies.
function measure(rows) {
  const t = {
    requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, compactions: 0, summarySeconds: 0,
    reads: 0, rereads: 0, avgContext: 0, followUpWrite: 0, followUpMaxContext: 0,
  }
  const seen = new Set()
  const seenUse = new Set()
  const read = new Set()
  let followUp = false
  let context = 0
  for (const r of rows) {
    if (r.type === 'user' && typeof r.message?.content === 'string' && r.message.content.startsWith('Answer with one JSON')) followUp = true
    if (r.subtype === 'compact_boundary') {
      t.compactions++
      t.summarySeconds += (r.compactMetadata?.durationMs ?? 0) / 1000
    }
    if (r.type !== 'assistant' || r.isCompactSummary) continue
    const m = r.message
    const u = m.usage ?? {}
    const size = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    if (m.id && !seen.has(m.id) && size) {
      seen.add(m.id)
      t.requests++
      t.input += u.input_tokens ?? 0
      t.cacheRead += u.cache_read_input_tokens ?? 0
      t.cacheWrite += u.cache_creation_input_tokens ?? 0
      t.output += u.output_tokens ?? 0
      context += size
      if (followUp) {
        t.followUpWrite += u.cache_creation_input_tokens ?? 0
        t.followUpMaxContext = Math.max(t.followUpMaxContext, size)
      }
    }
    for (const b of m.content ?? []) {
      if (b.type !== 'tool_use' || b.name !== 'Read' || seenUse.has(b.id)) continue
      seenUse.add(b.id)
      const file = String(b.input?.file_path ?? '').split('/').pop()
      if (!/^part\d+\.txt$/.test(file)) continue
      t.reads++
      if (read.has(file)) t.rereads++
      read.add(file)
    }
  }
  t.filesRead = read.size
  t.avgContext = t.requests ? Math.round(context / t.requests) : 0
  return t
}

function score(answer, truth) {
  const m = String(answer ?? '').match(/\{[\s\S]*\}/)
  let a = {}
  try {
    a = JSON.parse(m?.[0] ?? '{}')
  } catch {}
  if (truth.decisions) {
    const same = (x, y) => String(x ?? '').trim().toLowerCase() === String(y).toLowerCase()
    return {
      decisions: Object.keys(truth.decisions).filter(k => same(a.decisions?.[k], truth.decisions[k])).length,
      keys: RECALL_KEYS.filter(k => same(a.keys?.[k], truth.keys[k])).length,
    }
  }
  const keys = ASK_KEYS.filter(k => String(a.keys?.[k] ?? '').trim() === truth.keys[k]).length
  const colors = ASK_COLORS.filter(k => String(a.colors?.[k] ?? '').trim().toLowerCase() === truth.colors[k]).length
  return { keys, colors }
}

async function run(arm, rep) {
  const dir = mkdtempSync(join(tmpdir(), `td-bench-${arm}-${rep}-`))
  const truth = fixtures(dir, 1000 + rep)
  await new Promise(r => spawn('git', ['init', '-q'], { cwd: dir }).on('close', r))
  const settings = JSON.stringify({ autoCompactWindow: WINDOW, pluginConfigs: { 'tokendoctor@tokendoctor': { options: ARMS[arm] } } })
  const base = ['--model', MODEL, '--output-format', 'json', '--allowedTools', 'Read', '--settings', settings]
  const started = Date.now()
  const resume = (prev, prompt) => (prev.session_id ? claude(dir, ['-p', prompt, '--resume', prev.session_id, ...base]) : Promise.resolve(prev))
  let first = null
  if (TASK === 'recall') {
    truth.decisions = decisions(1000 + rep)
    first = await claude(dir, ['-p', BRIEF(truth.decisions), ...base])
  }
  const one = first ? await resume(first, READ_ALL) : await claude(dir, ['-p', READ_ALL, ...base])
  if (TASK === 'recall') for (const f of readdirSync(dir)) if (/^part\d+\.txt$/.test(f)) rmSync(join(dir, f))
  const two = await resume(one, TASK === 'recall' ? RECALL : FOLLOW_UP)
  const t = measure(transcript(two.session_id ?? one.session_id))
  const s = score(two.result, truth)
  const result = {
    arm, rep, dir, sessionId: two.session_id ?? one.session_id,
    // A resumed run's total_cost_usd counts the session from its start, the earlier runs included.
    cost: two.total_cost_usd ?? one.total_cost_usd ?? 0,
    workCost: one.total_cost_usd ?? 0,
    seconds: Math.round((Date.now() - started) / 1000),
    error: [first, one, two].find(x => x?.is_error)?.result ?? null,
    ...t, ...s, answer: String(two.result ?? '').slice(0, 400),
  }
  const scored = TASK === 'recall'
    ? `decisions ${s.decisions}/6, keys ${s.keys}/${RECALL_KEYS.length}`
    : `keys ${s.keys}/${ASK_KEYS.length}, colors ${s.colors}/${ASK_COLORS.length}`
  console.error(
    `${arm} #${rep}: $${result.cost.toFixed(4)} (work $${result.workCost.toFixed(4)}), ${result.seconds}s, ${t.compactions} compactions, ` +
      `read ${t.filesRead}/${FILES}, ${scored}, ` +
      `follow-up context ${Math.round(t.followUpMaxContext / 1000)}K${result.error ? `, error: ${result.error.slice(0, 120)}` : ''}`,
  )
  return result
}

const queue = []
for (let rep = 1; rep <= REPS; rep++) for (const arm of arms) queue.push([arm, rep])
const results = []
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    while (queue.length) results.push(await run(...queue.shift()))
  }),
)

mkdirSync(OUT, { recursive: true })
const file = join(OUT, `window-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
// What goes into git names no one: the home folder becomes ~, a temporary folder $TMPDIR.
const scrub = (text) => text.replace(/\/(?:private\/)?var\/folders\/[^"\s/]+\/[^"\s/]+\/T\//g, '$TMPDIR/').split(homedir()).join('~')
writeFileSync(file, scrub(JSON.stringify({ task: TASK, model: MODEL, files: FILES, lines: LINES, window: WINDOW, reps: REPS, results }, null, 1)))

const mean = (xs, f) => xs.reduce((n, x) => n + f(x), 0) / xs.length
const rows = arms.map(arm => {
  const xs = results.filter(r => r.arm === arm)
  return {
    arm,
    'cost $': mean(xs, r => r.cost).toFixed(4),
    'work $': mean(xs, r => r.workCost).toFixed(4),
    s: Math.round(mean(xs, r => r.seconds)),
    compactions: mean(xs, r => r.compactions).toFixed(1),
    'files read': `${mean(xs, r => r.filesRead).toFixed(1)}/${FILES}`,
    rereads: mean(xs, r => r.rereads).toFixed(1),
    ...(TASK === 'recall'
      ? { 'decisions ok': `${mean(xs, r => r.decisions).toFixed(1)}/6`, 'keys ok': `${mean(xs, r => r.keys).toFixed(1)}/${RECALL_KEYS.length}` }
      : { 'keys ok': `${mean(xs, r => r.keys).toFixed(1)}/${ASK_KEYS.length}`, 'colors ok': `${mean(xs, r => r.colors).toFixed(1)}/${ASK_COLORS.length}` }),
    'avg ctx K': Math.round(mean(xs, r => r.avgContext) / 1000),
    'cache write K': Math.round(mean(xs, r => r.cacheWrite) / 1000),
    'follow-up ctx K': Math.round(mean(xs, r => r.followUpMaxContext) / 1000),
    errors: xs.filter(r => r.error).length,
  }
})
console.table(rows)
console.log(`Saved ${file}`)
