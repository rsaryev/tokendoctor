// The settings tokendoctor-set may change: keys that move token use or cost, each checked against
// settings-reference.md or env-vars.md. `live`: Claude Code reloads settings files on change, except
// model, effortLevel and modelSettings (settings.md#when-edits-take-effect). A saved `env` change is
// re-applied to the running session, but which variables are read again is not documented, so env
// values count as next-session.
// Hooks, permissions and anything that widens what Claude
// may do are deliberately absent, so a model driving this tool cannot grant itself more.
const n = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max
const oneOf = (...xs) => (v) => xs.includes(v)
const bool = (v) => typeof v === 'boolean'
const str = (v) => typeof v === 'string' && v.length > 0 && v.length < 200
const envNum = (min, max) => (v) => /^\d+$/.test(String(v)) && Number(v) >= min && Number(v) <= max

export const TUNABLES = {
  autoCompactWindow: { check: n(100000, 1000000), live: true, about: 'tokens in context before auto-compaction' },
  autoCompactEnabled: { check: bool, live: true, about: 'automatic compaction on or off' },
  idleCompaction: { check: bool, live: true, about: 'false stops compacting a long idle conversation before its one-hour cache expires' },
  model: { check: str, live: false, about: 'default model for new sessions' },
  advisorModel: { check: str, live: true, about: 'advisor model' },
  effortLevel: { check: oneOf('low', 'medium', 'high', 'xhigh'), live: false, about: 'reasoning effort for models without a saved level; in user settings not used by Opus 5.5 and later' },
  alwaysThinkingEnabled: { check: bool, live: true, about: 'extended thinking by default' },
  fastMode: { check: bool, live: true, about: 'fast mode (higher price per token)' },
  fastModePerSessionOptIn: { check: bool, live: true, about: 'fast mode only after /fast in a session' },
  includeGitInstructions: { check: bool, live: true, about: 'built-in git instructions and status in the system prompt' },
  bashOutputMaxChars: { check: n(4000, 128000), live: true, about: 'Bash output kept inline' },
  promptSuggestionEnabled: { check: bool, live: true, about: 'prompt suggestions (a small request after each reply)' },
  skillListingBudgetFraction: { check: (v) => typeof v === 'number' && v > 0 && v <= 0.1, live: true, about: 'share of context for the skill listing' },
  skillListingMaxDescChars: { check: n(100, 5000), live: true, about: 'characters per skill description in the listing' },
  outputStyle: { check: str, live: true, about: 'output style' },
  cleanupPeriodDays: { check: n(1, 3650), live: true, about: 'days transcripts are kept' },
  disableClaudeAiConnectors: { check: bool, live: true, about: 'claude.ai connectors off' },
  promptCacheTtl: { check: oneOf('5m', '1h'), live: true, about: 'main-conversation prompt cache TTL' },
  subagentPromptCacheTtl: { check: oneOf('5m', '1h'), live: true, about: 'subagent prompt cache TTL' },
  'env.CLAUDE_CODE_SUBAGENT_MODEL': { check: str, live: false, about: 'model for subagents without their own' },
  'env.CLAUDE_CODE_EFFORT_LEVEL': { check: oneOf('low', 'medium', 'high', 'xhigh', 'max', 'auto'), live: false, about: 'effort, over /effort and effortLevel' },
  'env.CLAUDE_CODE_AUTO_COMPACT_WINDOW': { check: (v) => /^\d+[kK]?$/.test(String(v)), live: false, about: 'auto-compact window, over the setting' },
  'env.MAX_MCP_OUTPUT_TOKENS': { check: envNum(1000, 200000), live: false, about: 'MCP tool output limit' },
  'env.BASH_MAX_OUTPUT_LENGTH': { check: envNum(1000, 150000), live: false, about: 'Bash output limit (bashOutputMaxChars wins)' },
  'env.ENABLE_TOOL_SEARCH': { check: (v) => /^(true|false|auto(:\d+)?)$/.test(String(v)), live: false, about: 'defer MCP tool definitions' },
  'env.CLAUDE_CODE_MAX_OUTPUT_TOKENS': { check: envNum(1000, 200000), live: false, about: 'max output tokens per response' },
  'env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS': { check: envNum(1000, 200000), live: false, about: 'Read tool output limit' },
  'env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS': { check: oneOf('1', '0'), live: false, about: 'drop built-in git instructions' },
}

// Per-model keys under modelSettings, which /effort and the /model picker write
// (settings-reference.md#modelsettings): modelSettings.<model id>.effortLevel and .autoCompactWindow.
const PER_MODEL = /^modelSettings\.(claude-[a-z0-9-]+)\.(effortLevel|autoCompactWindow)$/
const PER_MODEL_FIELDS = {
  effortLevel: { check: TUNABLES.effortLevel.check, live: false, about: 'reasoning effort saved for one model' },
  autoCompactWindow: { check: TUNABLES.autoCompactWindow.check, live: false, about: 'auto-compact window for one model' },
}
export const tunable = (key) => TUNABLES[key] ?? PER_MODEL_FIELDS[PER_MODEL.exec(key)?.[2]]

// Parses a command-line value as JSON when it is one (true, 400000, "1h"), else keeps the text.
export function parseValue(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// Returns the settings op for a change, or throws with the reason it is refused.
export function tunableOp(key, value) {
  const t = tunable(key)
  if (!t) throw new Error(`"${key}" is not a setting tokendoctor changes. Allowed: ${Object.keys(TUNABLES).join(', ')}, modelSettings.<model id>.effortLevel|autoCompactWindow`)
  if (value === undefined) return { op: 'unset', key }
  const v = key.startsWith('env.') ? String(value) : value
  if (!t.check(v)) throw new Error(`${JSON.stringify(value)} is not a valid value for ${key} (${t.about})`)
  return { op: 'set', key, value: v }
}
