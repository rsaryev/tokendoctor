// Turns a finding's fixes into file changes. applyOps is pure; planFix/writePlan touch the disk.
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDir, settingsPath } from './collect.mjs'

const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest']
const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'agents')

// Applies set/unset/add/dropHooks ops to a settings object and returns a new one. Dotted keys
// address nested objects ("env.FOO"); `add` unions values into an array without duplicates;
// `dropHooks` removes the entries with the given matcher from the tool events, and an event
// left empty is removed with them.
export function applyOps(settings, ops) {
  const out = structuredClone(settings)
  for (const op of ops) {
    if (op.op === 'dropHooks') {
      for (const event of TOOL_EVENTS) {
        const kept = (out.hooks?.[event] ?? []).filter((h) => h.matcher !== op.matcher)
        if (!out.hooks?.[event]) continue
        if (kept.length) out.hooks[event] = kept
        else delete out.hooks[event]
      }
      continue
    }
    const path = op.key.split('.')
    const last = path.pop()
    let node = out
    for (const p of path) node = node[p] = node[p] && typeof node[p] === 'object' ? node[p] : {}
    if (op.op === 'set') node[last] = op.value
    else if (op.op === 'unset') delete node[last]
    else if (op.op === 'add') node[last] = [...new Set([...(node[last] ?? []), ...op.values])]
  }
  return out
}

// What dropHooks would remove, one line per event: the hook commands in the entries that match.
function describeDrops(settings, ops) {
  const lines = []
  for (const op of ops.filter((o) => o.op === 'dropHooks')) {
    for (const event of TOOL_EVENTS) {
      const gone = (settings.hooks?.[event] ?? []).filter((h) => h.matcher === op.matcher)
      if (!gone.length) continue
      const commands = gone.flatMap((h) => (h.hooks ?? []).map((x) => x.command ?? x.type ?? 'hook'))
      lines.push(`remove ${gone.length} "${op.matcher}" hook from ${event}: ${commands.join(', ')}`)
    }
  }
  return lines
}

// Lines present in only one side, as a short -/+ summary (settings files are small and flat).
export function diffLines(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  const inA = new Set(a)
  const inB = new Set(b)
  return [...a.filter((l) => !inB.has(l)).map((l) => `- ${l}`), ...b.filter((l) => !inA.has(l)).map((l) => `+ ${l}`)].join('\n')
}

export function planFix(fix, project, scopeOverride) {
  const scope = scopeOverride ?? fix.scope
  if (fix.template) {
    const base = scope === 'user' ? join(configDir(), 'agents') : join(project, '.claude', 'agents')
    const path = join(base, `${fix.template}.md`)
    return { kind: 'template', scope, path, source: join(TEMPLATES, `${fix.template}.md`), exists: existsSync(path) }
  }
  if (fix.script) {
    const path = join(configDir(), `tokendoctor-${fix.script}`)
    return { kind: 'script', scope, path, source: join(TEMPLATES, '..', fix.script), exists: existsSync(path) }
  }
  return planOps(settingsPath(scope, project), scope, fix.ops)
}

// The plan for ops on one settings file, with each set or unset key's value before and after.
export function planOps(path, scope, ops) {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '{}\n'
  const parsed = JSON.parse(before)
  // Diff against the normalised original so only real changes show, not a reformatting.
  const normalized = JSON.stringify(parsed, null, 2) + '\n'
  const after = JSON.stringify(applyOps(parsed, ops), null, 2) + '\n'
  const drops = ops.every((o) => o.op === 'dropHooks') ? describeDrops(parsed, ops) : null
  const changes = ops
    .filter((o) => o.op === 'set' || o.op === 'unset')
    .map((o) => ({ key: o.key, before: valueAt(parsed, o.key), after: o.op === 'set' ? o.value : undefined }))
  return { kind: 'settings', scope, path, before, normalized, after, drops, changes, exists: existsSync(path) }
}

/** The value at a dotted key, undefined when absent. */
export function valueAt(settings, key) {
  return key.split('.').reduce((node, p) => (node && typeof node === 'object' ? node[p] : undefined), settings)
}

/** Where tokendoctor notes each settings change it writes, for /tokendoctor undo. */
export function journalPath() {
  return join(configDir(), 'tokendoctor', 'changes.jsonl')
}

/** The changes tokendoctor wrote, newest first. */
export function readJournal() {
  if (!existsSync(journalPath())) return []
  return readFileSync(journalPath(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)]
      } catch {
        return []
      }
    })
    .reverse()
}

export function describePlan(plan) {
  if (plan.kind === 'template' || plan.kind === 'script') {
    const what = plan.kind === 'script' ? 'new executable script' : 'new agent file from the template'
    return plan.exists ? `${plan.path}: already exists, will not overwrite` : `${plan.path}: ${what}`
  }
  const diff = plan.drops ? plan.drops.join('\n') : diffLines(plan.normalized, plan.after)
  const note = plan.exists && plan.before !== plan.normalized ? '\n(the file will also be re-indented as 2-space JSON)' : ''
  return `${plan.path}${plan.exists ? '' : ' (new file)'}\n${diff || '(no change)'}${note}`
}

// Writes a plan. An existing file is copied to <file>.tokendoctor-<timestamp>.bak first.
export function writePlan(plan, now = new Date()) {
  if (plan.kind !== 'settings' && plan.exists) return { written: false, reason: 'exists' }
  mkdirSync(dirname(plan.path), { recursive: true })
  let backup = null
  if (plan.kind === 'settings') {
    if (plan.normalized === plan.after) return { written: false, reason: 'no change' }
    if (plan.exists) {
      backup = `${plan.path}.tokendoctor-${now.toISOString().replace(/[:.]/g, '-')}.bak`
      copyFileSync(plan.path, backup)
    }
    writeFileSync(plan.path, plan.after)
    if (plan.changes?.length) {
      mkdirSync(dirname(journalPath()), { recursive: true })
      // JSON drops an undefined value: a key absent from a change was unset there.
      appendFileSync(journalPath(), JSON.stringify({ at: now.toISOString(), path: plan.path, scope: plan.scope, changes: plan.changes, backup }) + '\n')
    }
  } else {
    copyFileSync(plan.source, plan.path)
    if (plan.kind === 'script') chmodSync(plan.path, 0o755)
  }
  return { written: true, backup }
}
