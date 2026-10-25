// Reads the user's configuration into the plain snapshot the rules consume. Read-only.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
  'DISABLE_PROMPT_CACHING',
  'DISABLE_PROMPT_CACHING_HAIKU',
  'DISABLE_PROMPT_CACHING_SONNET',
  'DISABLE_PROMPT_CACHING_OPUS',
  'DISABLE_PROMPT_CACHING_FABLE',
  'FORCE_PROMPT_CACHING_5M',
  'MAX_MCP_OUTPUT_TOKENS',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL_FORCE',
  'CLAUDE_CODE_DISABLE_ADVISOR_TOOL',
  'MAX_THINKING_TOKENS',
  'DISABLE_TELEMETRY',
  'DO_NOT_TRACK',
  'DISABLE_GROWTHBOOK',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'DISABLE_AUTO_COMPACT',
  'ENABLE_TOOL_SEARCH',
  'BASH_MAX_OUTPUT_LENGTH',
]

const HEAVY_NAMES = new Set(['target', 'dist', 'build', 'coverage', '.turbo', '.next', '.cache'])
const HEAVY_BYTES = 100e6
const LOCKFILES = ['bun.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'poetry.lock', 'uv.lock']
const LOCKFILE_BYTES = 200e3
const MAX_DEPTH = 4
// Files that mark a language with an official code intelligence plugin (code-intelligence.md).
const LANGUAGE_MARKERS = [
  ['tsconfig.json', 'typescript-lsp'],
  ['pyproject.toml', 'pyright-lsp'],
  ['requirements.txt', 'pyright-lsp'],
  ['go.mod', 'gopls-lsp'],
  ['Cargo.toml', 'rust-analyzer-lsp'],
  ['Gemfile', 'ruby-lsp'],
  ['pom.xml', 'jdtls-lsp'],
  ['build.gradle', 'jdtls-lsp'],
  ['build.gradle.kts', 'kotlin-lsp'],
  ['Package.swift', 'swift-lsp'],
  ['composer.json', 'php-lsp'],
  ['CMakeLists.txt', 'clangd-lsp'],
]

export function configDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}

export function settingsPath(scope, project, env = process.env) {
  if (scope === 'user') return join(configDir(env), 'settings.json')
  if (scope === 'project') return join(project, '.claude', 'settings.json')
  return join(project, '.claude', 'settings.local.json')
}

// A missing file is an empty object; a file that exists but does not parse is reported.
function readJson(path, unreadable) {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    unreadable?.push(path.replace(homedir(), '~'))
    return {}
  }
}

function claudeVersion() {
  try {
    const out = execFileSync('claude', ['--version'], { encoding: 'utf8', timeout: 15000 })
    return /\d+\.\d+\.\d+/.exec(out)?.[0] ?? null
  } catch {
    return null
  }
}

function agentInfo(dir) {
  if (!existsSync(dir)) return []
  const agents = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name))
      else if (e.name.endsWith('.md')) {
        const head = readFileSync(join(d, e.name), 'utf8').split('\n---')[0]
        const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(head)?.[1].trim()
        agents.push({ name: field('name') ?? e.name.slice(0, -3), model: field('model') ?? null })
      }
    }
  }
  walk(dir)
  return agents
}

// Counts skills and how many of them put a description in every session's context.
function countSkills(...dirs) {
  let total = 0
  let autoLoaded = 0
  const names = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, e.name, 'SKILL.md')
      if (!existsSync(file)) continue
      total++
      names.push(e.name)
      const head = readFileSync(file, 'utf8').split('\n---')[0]
      if (!/^disable-model-invocation:\s*(true|yes|on|1)\s*$/m.test(head)) autoLoaded++
    }
  }
  return { total, autoLoaded, names }
}

function instructionFiles(project) {
  const files = []
  const seen = new Set()
  const add = (path) => {
    if (seen.has(path) || !existsSync(path)) return
    seen.add(path)
    const text = readFileSync(path, 'utf8')
    files.push({
      path: path.replace(project + '/', ''),
      lines: text.split('\n').length,
      compactInstructions: /^#+\s*compact instructions/im.test(text),
    })
    for (const m of text.matchAll(/^@(\S+)$/gm)) add(resolve(project, m[1]))
  }
  add(join(project, 'CLAUDE.md'))
  add(join(project, '.claude', 'CLAUDE.md'))
  return files
}

// Sums file sizes in JS (no external `du`), stopping once the threshold is reached.
function dirBytes(path, limit) {
  let total = 0
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (total >= limit) return
      const full = join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(full)
      else {
        try {
          total += lstatSync(full).size
        } catch {}
      }
    }
  }
  walk(path)
  return total
}

function heavyDirs(project, heavyBytes) {
  const found = []
  const walk = (dir, depth) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink() || e.name === '.git' || e.name === 'node_modules') continue
      const path = join(dir, e.name)
      if (HEAVY_NAMES.has(e.name)) {
        if (found.length < 20) found.push({ name: e.name, path: path.replace(project + '/', ''), bytes: dirBytes(path, heavyBytes) })
      } else if (depth < MAX_DEPTH) walk(path, depth + 1)
    }
  }
  walk(project, 0)
  return found.filter((d) => d.bytes >= heavyBytes)
}

function languageMarkers(project) {
  return [...new Set(LANGUAGE_MARKERS.filter(([file]) => existsSync(join(project, file))).map(([, plugin]) => plugin))]
}

function largeLockfiles(project) {
  return LOCKFILES.flatMap((name) => {
    try {
      const bytes = statSync(join(project, name)).size
      return bytes >= LOCKFILE_BYTES ? [{ name, bytes }] : []
    } catch {
      return []
    }
  })
}

// Reads only the MCP server keys of ~/.claude.json: the file also holds account data.
function mcpServerCount(project) {
  const home = process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : join(homedir(), '.claude.json')
  const raw = readJson(home)
  const top = Object.keys(raw.mcpServers ?? {}).length
  const local = Object.keys(raw.projects?.[project]?.mcpServers ?? {}).length
  const shared = Object.keys(readJson(join(project, '.mcp.json')).mcpServers ?? {}).length
  return top + local + shared
}

export function collect(project = process.cwd(), { heavyBytes = HEAVY_BYTES } = {}) {
  project = resolve(project)
  const unreadable = []
  const settings = {
    user: readJson(settingsPath('user', project), unreadable),
    project: readJson(settingsPath('project', project), unreadable),
    local: readJson(settingsPath('local', project), unreadable),
  }
  const env = {}
  for (const k of ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k]
  for (const sc of ['user', 'project', 'local']) Object.assign(env, settings[sc].env ?? {})
  const enabledPluginNames = [
    ...new Set(
      ['user', 'project', 'local'].flatMap((sc) =>
        Object.entries(settings[sc].enabledPlugins ?? {})
          .filter(([, on]) => on)
          .map(([name]) => name),
      ),
    ),
  ]
  const skills = countSkills(join(configDir(), 'skills'), join(project, '.claude', 'skills'))
  return {
    version: claudeVersion(),
    project,
    configDir: configDir(),
    settings,
    env,
    unreadable,
    agents: {
      user: agentInfo(join(configDir(), 'agents')),
      project: agentInfo(join(project, '.claude', 'agents')),
    },
    userSkillNames: countSkills(join(configDir(), 'skills')).names,
    projectSkillNames: countSkills(join(project, '.claude', 'skills')).names,
    lockfiles: largeLockfiles(project),
    instructionFiles: instructionFiles(project),
    skills,
    enabledPluginNames,
    enabledPlugins: enabledPluginNames.length,
    languageMarkers: languageMarkers(project),
    mcpServers: mcpServerCount(project),
    heavyDirs: heavyDirs(project, heavyBytes),
  }
}

