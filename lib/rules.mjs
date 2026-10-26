// Pure audit rules. Each rule reads a snapshot (see collect.mjs) and returns a finding or null.
// Nothing here touches the disk, so every rule is unit-testable on a fixture snapshot.
//
// A finding: { id, severity: 'error'|'warn'|'info', title, detail, doc, fixes?: Fix[] }
// A Fix is one of:
//   { scope, ops: [{ op: 'set'|'unset'|'add', key, value|values }] }   settings edit
//   { scope, template }                                                 copy templates/agents/<template>.md

const DOCS = {
  model: 'https://code.claude.com/docs/en/model-config.md',
  costs: 'https://code.claude.com/docs/en/costs.md',
  subagents: 'https://code.claude.com/docs/en/sub-agents.md',
  advisor: 'https://code.claude.com/docs/en/advisor.md',
  settings: 'https://code.claude.com/docs/en/settings.md',
  skills: 'https://code.claude.com/docs/en/skills.md',
}

const SCOPES = ['user', 'project', 'local']
const COMPACT_WINDOW = 400000

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export function modelFamily(name) {
  const m = String(name ?? '').toLowerCase()
  for (const family of ['fable', 'opus', 'sonnet', 'haiku']) if (m.includes(family)) return family
  return null
}

const RANK = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

// Effort levels in order, and each model's default (model-config.md#adjust-effort-level): medium on
// Opus 5.5, Sonnet 5.5 and Haiku 5.5, xhigh on Opus 4.7, high elsewhere.
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max']
const defaultEffort = (model) => (/(opus|sonnet|haiku)-5-5/.test(model) ? 'medium' : /opus-4-7/.test(model) ? 'xhigh' : 'high')

export function mainModel(snapshot) {
  const { settings, env } = snapshot
  return env.ANTHROPIC_MODEL ?? settings.local.model ?? settings.project.model ?? settings.user.model ?? null
}

const truthy = (v) => v !== undefined && v !== '' && v !== '0' && v !== 'false'

// Variables that stop Claude Code fetching feature flags (env-vars.md#features-that-need-feature-flag-fetching).
// DISABLE_TELEMETRY and CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC count even when set to 0 or false.
function flagFetchBlockers(env) {
  const set = (k) => env[k] !== undefined && env[k] !== ''
  return [
    set('DISABLE_TELEMETRY') && 'DISABLE_TELEMETRY',
    set('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC') && 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    truthy(env.DO_NOT_TRACK) && 'DO_NOT_TRACK',
    truthy(env.DISABLE_GROWTHBOOK) && 'DISABLE_GROWTHBOOK',
  ].filter(Boolean)
}

function scopesWith(snapshot, key) {
  return SCOPES.filter((s) => snapshot.settings[s][key] !== undefined)
}

const RULES = [
  {
    id: 'compact-window-unset',
    since: '2.1.288',
    run(s) {
      const { settings, env } = s
      const perModel = SCOPES.some((sc) =>
        Object.values(settings[sc].modelSettings ?? {}).some((m) => m?.autoCompactWindow),
      )
      if (SCOPES.some((sc) => settings[sc].autoCompactWindow) || perModel) return null
      if (env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) return null
      return {
        severity: 'warn',
        title: 'No auto-compact window is set',
        detail:
          'Models with a native 1M window (Fable, Sonnet 5+, Haiku 5.5, Opus 4.7+) compact only at ' +
          'about 967K tokens by default, so every request carries a very long history. A smaller ' +
          `window (${COMPACT_WINDOW.toLocaleString('en')} here, valid range 100K to 1M) compacts earlier. ` +
          'Too small a window compacts often, which re-reads history and breaks the prompt cache.',
        doc: `${DOCS.model}#set-the-auto-compact-window`,
        fixes: [{ scope: 'user', ops: [{ op: 'set', key: 'autoCompactWindow', value: COMPACT_WINDOW }] }],
      }
    },
  },
  {
    id: 'compact-threshold-undocumented',
    run(s) {
      const scopes = scopesWith(s, 'autoCompactThreshold')
      if (!scopes.length) return null
      return {
        severity: 'error',
        title: '`autoCompactThreshold` is not a documented setting',
        detail:
          `Found in ${scopes.join(', ')} settings. The documented keys are \`autoCompactWindow\` ` +
          '(a token count) and the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` variable, so this key is most ' +
          'likely ignored and compaction is not configured the way it looks.',
        doc: `${DOCS.model}#set-the-auto-compact-window`,
        fixes: scopes.map((scope) => ({ scope, ops: [{ op: 'unset', key: 'autoCompactThreshold' }] })),
      }
    },
  },
  {
    id: 'compact-env-bare-number',
    run(s) {
      const raw = s.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
      if (raw === undefined || !/^\d+$/.test(String(raw))) return null
      if (Number(raw) >= 100000) return null
      return {
        severity: 'error',
        title: '`CLAUDE_CODE_AUTO_COMPACT_WINDOW` is below the 100,000 minimum',
        detail:
          `Set to ${raw}. In this variable a bare number is read as tokens (not thousands), and ` +
          'values outside 100,000 to 1,000,000 are clamped with a warning. Use 200000, or 200k on ' +
          'Claude Code 2.1.304 and later.',
        doc: `${DOCS.model}#set-the-auto-compact-window`,
      }
    },
  },
  {
    id: 'explore-default-model',
    since: '2.1.251',
    run(s) {
      if ([...s.agents.user, ...s.agents.project].some((a) => a.name === 'Explore')) return null
      const main = modelFamily(mainModel(s))
      if (main === 'sonnet' || main === 'haiku') return null
      return {
        severity: 'info',
        title: 'Built-in Explore agent has no override',
        detail:
          'The built-in Explore agent runs on the main conversation\'s model (on Opus when that is ' +
          'Fable), so on Opus or Fable its read-only searches cost what the main thread costs. ' +
          'CLAUDE_CODE_SUBAGENT_MODEL does not move it. A user or project agent named Explore ' +
          'overrides it; the shipped template pins Haiku and read-only tools. Skip this if your ' +
          'search quality needs a stronger model.',
        doc: `${DOCS.subagents}#built-in-subagents`,
        fixes: [{ scope: 'user', template: 'Explore' }],
      }
    },
  },
  {
    id: 'subagent-model-force',
    since: '2.1.257',
    run(s) {
      if (!truthy(s.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE)) return null
      return {
        severity: 'warn',
        title: 'Every subagent is forced onto one model',
        detail:
          `CLAUDE_CODE_SUBAGENT_MODEL_FORCE ignores each agent's own model, including agents that ` +
          `need to reason (Plan, reviewers). Forced model: ${s.env.CLAUDE_CODE_SUBAGENT_MODEL ?? 'the main model'}. ` +
          'Prefer pinning cheap models on search and test agents through their frontmatter.',
        doc: `${DOCS.subagents}#run-every-subagent-on-one-model`,
      }
    },
  },
  {
    id: 'subagent-model-unset',
    since: '2.1.251',
    run(s) {
      if (s.env.CLAUDE_CODE_SUBAGENT_MODEL) return null
      if (modelFamily(mainModel(s)) === 'sonnet' || modelFamily(mainModel(s)) === 'haiku') return null
      return {
        severity: 'info',
        title: 'Subagents inherit the main model',
        detail:
          `The main model is ${mainModel(s) ?? 'the default'}, so general-purpose subagents run on it too. ` +
          'Setting CLAUDE_CODE_SUBAGENT_MODEL (for example to sonnet) in the `env` block of ' +
          'settings.json moves them and custom agents without a `model` down, without forcing agents ' +
          'that name their own. Explore, Plan and forks keep the main model either way.',
        doc: `${DOCS.subagents}#choose-a-model`,
        fixes: [{ scope: 'user', ops: [{ op: 'set', key: 'env.CLAUDE_CODE_SUBAGENT_MODEL', value: 'sonnet' }] }],
      }
    },
  },
  {
    id: 'thinking-tokens-env',
    run(s) {
      const raw = s.env.MAX_THINKING_TOKENS
      if (!truthy(raw)) return null
      return {
        severity: 'info',
        title: '`MAX_THINKING_TOKENS` only applies to fixed-budget models',
        detail:
          `Set to ${raw}. Adaptive-reasoning models ignore a nonzero budget, and Opus 5.5, Sonnet 5.5, ` +
          'Haiku 5.5 and the Fable models cannot turn thinking off. On those, lower the effort level ' +
          'with /effort or modelSettings instead.',
        doc: `${DOCS.costs}#adjust-extended-thinking`,
      }
    },
  },
  {
    id: 'effort-max-in-settings',
    run(s) {
      const scopes = SCOPES.filter((sc) => s.settings[sc].effortLevel === 'max')
      if (!scopes.length) return null
      return {
        severity: 'warn',
        title: '`effortLevel: "max"` is not accepted in settings',
        detail:
          `Found in ${scopes.join(', ')} settings. The \`effortLevel\` key accepts low, medium, high ` +
          'and xhigh; max works only per session (/effort max or --effort max).',
        doc: `${DOCS.model}#adjust-effort-level`,
        fixes: scopes.map((scope) => ({ scope, ops: [{ op: 'set', key: 'effortLevel', value: 'xhigh' }] })),
      }
    },
  },
  {
    id: 'effort-user-key-ignored',
    run(s) {
      const level = s.settings.user.effortLevel
      if (level === undefined) return null
      return {
        severity: 'info',
        title: '`effortLevel` in user settings does not apply to Opus 5.5',
        detail:
          `Set to ${JSON.stringify(level)}. That top-level key keeps applying to Opus 5, Fable 5.1 and ` +
          'earlier models, but Opus 5.5 and later models use the level /effort or the /model picker ' +
          'saves for each of them under `modelSettings`, or their own default (medium on Opus 5.5). ' +
          'Set the level for the model you use with /effort.',
        doc: `${DOCS.model}#adjust-effort-level`,
      }
    },
  },
  {
    id: 'effort-above-default',
    run(s) {
      const above = SCOPES.flatMap((scope) =>
        Object.entries(s.settings[scope].modelSettings ?? {})
          .filter(([model, m]) => EFFORT.indexOf(m?.effortLevel) > EFFORT.indexOf(defaultEffort(model)))
          .map(([model, m]) => ({ scope, model, level: m.effortLevel })),
      )
      if (!above.length) return null
      return {
        severity: 'info',
        title: 'A model runs above its default effort',
        detail:
          above.map((a) => `${a.model}: ${a.level} (default ${defaultEffort(a.model)})`).join('; ') +
          ', saved by /effort. Higher effort thinks longer and verifies more on every turn, at higher ' +
          'token spend; the docs suggest the default for day-to-day work with a clear scope and a ' +
          'higher level where verification matters. Keep it if your work needs it. The fix removes the ' +
          'saved level, so the model starts at its default (Opus 5, Fable 5.1 and earlier take a ' +
          'top-level `effortLevel` instead, when one is set); /effort changes it per session.',
        doc: `${DOCS.model}#choose-an-effort-level`,
        fixes: [...new Set(above.map((a) => a.scope))].map((scope) => ({
          scope,
          ops: above.filter((a) => a.scope === scope).map((a) => ({ op: 'unset', key: `modelSettings.${a.model}.effortLevel` })),
        })),
      }
    },
  },
  {
    id: 'advisor-inactive',
    since: '2.1.260',
    run(s) {
      const advisor = SCOPES.map((sc) => s.settings[sc].advisorModel).find(Boolean)
      if (!advisor) return null
      const reasons = []
      const flagOff = flagFetchBlockers(s.env)
      if (flagOff.length) {
        reasons.push(`${flagOff.join(', ')} turns off the feature-flag fetch the advisor needs`)
      }
      if (truthy(s.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL)) {
        reasons.push('CLAUDE_CODE_DISABLE_ADVISOR_TOOL disables the tool outright')
      }
      // Family order holds for the current versions the aliases resolve to; the pairing table has
      // exceptions for older ones (advisor.md#choose-an-advisor-model), so a full id is not ranked.
      const alias = (m) => /^(fable|opus|sonnet|haiku)(\[1m\])?$/i.test(String(m ?? ''))
      const main = modelFamily(mainModel(s))
      const adv = modelFamily(advisor)
      if (main && adv && alias(mainModel(s)) && alias(advisor) && RANK[adv] < RANK[main]) {
        reasons.push(`the advisor (${advisor}) ranks below the main model (${mainModel(s)})`)
      }
      if (!reasons.length) return null
      return {
        severity: 'warn',
        title: 'The configured advisor will not run',
        detail: `${reasons.join('; ')}. Claude Code sends requests without an advisor in these cases.`,
        doc: `${DOCS.advisor}#choose-an-advisor-model`,
      }
    },
  },
  {
    id: 'instructions-long',
    run(s) {
      const long = s.instructionFiles.filter((f) => f.lines > 200)
      if (!long.length) return null
      return {
        severity: 'info',
        title: 'Instruction files are long',
        detail:
          long.map((f) => `${f.path}: ${f.lines} lines`).join('; ') +
          '. These load into every session and into every subagent except Explore and Plan and ' +
          'agents that set omitClaudeMd. ' +
          'The docs suggest staying under about 200 lines. What cuts the cost is moving ' +
          'workflow-specific text into skills (loaded only when used) or into `.claude/rules/*.md` ' +
          'files with a `paths:` frontmatter (loaded only when Claude works on matching files). ' +
          '@imports do not reduce it, because imported files load with the file that imports them. ' +
          'Block-level HTML comments are stripped before injection, so maintainer notes are free.',
        doc: `${DOCS.costs}#move-instructions-from-claudemd-to-skills`,
      }
    },
  },
  {
    id: 'context-surface',
    run(s) {
      const { skills, enabledPlugins, mcpServers } = s
      const parts = []
      if (skills.autoLoaded > 15) parts.push(`${skills.autoLoaded} skills whose descriptions load every session`)
      if (enabledPlugins > 6) parts.push(`${enabledPlugins} enabled plugins`)
      if (mcpServers > 5) parts.push(`${mcpServers} MCP servers`)
      if (!parts.length) return null
      return {
        severity: 'info',
        title: 'Large always-on context surface',
        detail:
          `${parts.join(', ')}. Skill descriptions are part of every request; ` +
          '`disable-model-invocation: true` keeps a skill out of context until you run it, and a ' +
          'plugin can be disabled per project in .claude/settings.local.json; `skillOverrides` ' +
          'hides your own skill without editing it (it does not apply to plugin skills: manage ' +
          'those through /plugin). MCP tool definitions are deferred by default (only ' +
          'names and server instructions are loaded until a tool is used), so a long MCP list ' +
          'costs less than it used to; /mcp disables a server you are not using. Run /context to ' +
          'see what actually costs the most.',
        doc: `${DOCS.skills}`,
      }
    },
  },
  {
    id: 'heavy-dirs-not-denied',
    run(s) {
      const deny = SCOPES.flatMap((sc) => s.settings[sc].permissions?.deny ?? []).filter((d) =>
        String(d).startsWith('Read('),
      )
      const open = s.heavyDirs.filter((d) => !deny.some((rule) => rule.includes(`${d.name}/`)))
      if (!open.length) return null
      const names = [...new Set(open.map((d) => d.name))]
      return {
        severity: 'info',
        title: 'Large generated directories are not excluded from reads',
        detail:
          open.map((d) => `${d.path} (${Math.round(d.bytes / 1e6)} MB)`).join('; ') +
          '. There is no ignore file: permissions.deny Read rules are the supported mechanism, and ' +
          'for Grep and Glob they are best-effort. They do not stop a file being read through Bash.',
        doc: 'https://code.claude.com/docs/en/permissions.md',
        fixes: [
          {
            scope: 'project',
            ops: [{ op: 'add', key: 'permissions.deny', values: names.map((n) => `Read(./**/${n}/**)`) }],
          },
        ],
      }
    },
  },
  {
    id: 'every-tool-hooks',
    run(s) {
      const events = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest']
      const perScope = SCOPES.map((scope) => {
        const hooks = s.settings[scope].hooks ?? {}
        return { scope, n: events.reduce((m, e) => m + (hooks[e] ?? []).filter((h) => h.matcher === '*').length, 0) }
      }).filter((x) => x.n)
      if (!perScope.length) return null
      const count = perScope.reduce((n, x) => n + x.n, 0)
      return {
        severity: 'info',
        title: 'Hooks run on every tool call',
        detail:
          `${count} tool-event hook(s) match "*" and start a process for each tool call. This ` +
          'costs latency rather than tokens. Narrow the matcher if the hook only cares about some ' +
          'tools. Dropping them is safe only if nothing depends on the events: a tool that shows ' +
          'agent status from these hooks (a terminal manager, a dashboard) will stop updating. ' +
          'The fix removes every "*" entry from the tool events in that scope, after a dry run.',
        doc: 'https://code.claude.com/docs/en/hooks.md',
        fixes: perScope.map(({ scope }) => ({ scope, ops: [{ op: 'dropHooks', matcher: '*' }] })),
      }
    },
  },
  {
    id: 'fast-mode-enabled',
    run(s) {
      const scopes = SCOPES.filter((sc) => s.settings[sc].fastMode === true)
      const optIn = SCOPES.some((sc) => s.settings[sc].fastModePerSessionOptIn === true)
      if (!scopes.length || optIn) return null
      return {
        severity: 'warn',
        title: 'Fast mode starts on in every session',
        detail:
          `\`fastMode: true\` is saved in ${scopes.join(', ')} settings. Fast mode costs more per ` +
          'token and runs only on Opus, so every session pays that rate whether or not it needs the ' +
          'speed. `fastModePerSessionOptIn: true` keeps the saved setting but makes you run /fast ' +
          'in the sessions where you want it.',
        doc: 'https://code.claude.com/docs/en/settings-reference.md#fastmodepersessionoptin',
        fixes: [{ scope: scopes[0], ops: [{ op: 'set', key: 'fastModePerSessionOptIn', value: true }] }],
      }
    },
  },
  {
    id: 'code-intelligence-missing',
    run(s) {
      const have = (s.enabledPluginNames ?? []).map((n) => n.split('@')[0])
      const missing = (s.languageMarkers ?? []).filter((p) => !have.includes(p))
      if (!missing.length) return null
      return {
        severity: 'info',
        title: 'No language server plugin for this project',
        detail:
          'The project has files for a language with an official code intelligence plugin: ' +
          missing.map((p) => `/plugin install ${p}@claude-plugins-official`).join('; ') +
          '. A language server gives Claude go-to-definition and type errors after each edit, so ' +
          'it reads fewer candidate files and catches mistakes without running a compiler. The ' +
          'plugin needs the language server binary on your PATH. It does not work in cloud sessions.',
        doc: 'https://code.claude.com/docs/en/plugins/code-intelligence.md',
      }
    },
  },
  {
    id: 'settings-unreadable',
    run(s) {
      if (!s.unreadable.length) return null
      return {
        severity: 'error',
        title: 'A settings file is not valid JSON',
        detail:
          `${s.unreadable.join(', ')} exists but does not parse, so none of its settings were audited ` +
          '(and Claude Code reports a Settings Error for it at startup). Settings files are strict ' +
          'JSON: no comments, no trailing commas. `claude doctor` lists what Claude Code rejected.',
        doc: `${DOCS.settings}#fix-a-broken-settings-file`,
      }
    },
  },
  {
    id: 'compact-window-small',
    since: '2.1.288',
    run(s) {
      const values = [
        ...SCOPES.map((sc) => s.settings[sc].autoCompactWindow),
        ...SCOPES.flatMap((sc) => Object.values(s.settings[sc].modelSettings ?? {}).map((m) => m?.autoCompactWindow)),
      ].filter((v) => typeof v === 'number')
      const small = values.filter((v) => v < 150000)
      if (!small.length) return null
      return {
        severity: 'warn',
        title: 'Auto-compact window is very small',
        detail:
          `Window of ${Math.min(...small).toLocaleString('en')} tokens. Compaction reads the whole conversation ` +
          'and breaks the prompt cache each time, so compacting often can cost more than it saves. ' +
          'Around 250K to 400K is a reasonable range; the minimum accepted is 100K.',
        doc: `${DOCS.model}#set-the-auto-compact-window`,
      }
    },
  },
  {
    id: 'prompt-caching-disabled',
    run(s) {
      const set = Object.keys(s.env).filter((k) => k.startsWith('DISABLE_PROMPT_CACHING') && truthy(s.env[k]))
      if (!set.length) return null
      return {
        severity: 'warn',
        title: 'Prompt caching is switched off',
        detail:
          `${set.join(', ')} set. Without the cache every request reprocesses the whole conversation ` +
          'at the full input rate. The docs describe these variables as a debugging aid; leave caching ' +
          'on for normal use.',
        doc: 'https://code.claude.com/docs/en/prompt-caching.md#disable-prompt-caching',
      }
    },
  },
  {
    id: 'prompt-cache-ttl-forced-short',
    since: '2.1.242',
    run(s) {
      if (!truthy(s.env.FORCE_PROMPT_CACHING_5M)) return null
      return {
        severity: 'info',
        title: 'Cache lifetime is forced to five minutes',
        detail:
          'FORCE_PROMPT_CACHING_5M overrides every other TTL control. After a break longer than five ' +
          'minutes the next message re-reads the full context uncached. The docs recommend it for ' +
          'debugging or comparing TTLs; on a plan that grants one hour it removes that benefit.',
        doc: 'https://code.claude.com/docs/en/prompt-caching.md#choose-the-ttl-yourself',
      }
    },
  },
  {
    id: 'agent-teams-enabled',
    run(s) {
      if (!truthy(s.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)) return null
      return {
        severity: 'info',
        title: 'Agent teams are enabled',
        detail:
          'Each teammate runs its own context window, and the docs put teams at roughly 7x the tokens ' +
          'of a standard session when teammates run in plan mode. Keep teams small, use Sonnet for ' +
          'teammates, and shut them down when their work is done.',
        doc: `${DOCS.costs}#agent-team-token-costs`,
      }
    },
  },
  {
    id: 'main-model-expensive',
    run(s) {
      const family = modelFamily(mainModel(s))
      if (family !== 'opus' && family !== 'fable') return null
      return {
        severity: 'info',
        title: `The default model is ${mainModel(s)}`,
        detail:
          'The docs name Opus left as the default as a usual cause of unexpectedly high spend. For most ' +
          'coding work Sonnet is enough (`/model sonnet`, or `model` in settings). ' +
          'Keep the larger model if the work needs it throughout.',
        doc: `${DOCS.costs}#choose-the-right-model`,
      }
    },
  },
  {
    id: 'agents-inherit-model',
    run(s) {
      const inheriting = [...s.agents.user, ...s.agents.project].filter((a) => !a.model || a.model === 'inherit')
      if (!inheriting.length) return null
      const names = inheriting.map((a) => a.name)
      return {
        severity: 'info',
        title: 'Custom agents run on the main model',
        detail:
          `${names.slice(0, 8).join(', ')}${names.length > 8 ? `, and ${names.length - 8} more` : ''} ` +
          'set no `model`, so they use the main conversation\'s model. Pin `model: haiku` or `sonnet` on ' +
          'agents that only search, run commands or summarise; leave reasoning-heavy agents inheriting.',
        doc: `${DOCS.subagents}#choose-a-model`,
      }
    },
  },
  {
    id: 'compact-instructions-missing',
    run(s) {
      if (!s.instructionFiles.length || s.instructionFiles.some((f) => f.compactInstructions)) return null
      return {
        severity: 'info',
        title: 'No "Compact instructions" section',
        detail:
          'A `# Compact instructions` section in CLAUDE.md tells compaction what to keep (failing test ' +
          'output, files changed, decisions) and what to drop, so a summary does not lose the thread. ' +
          'It is written for your project, so there is no automatic fix.',
        doc: `${DOCS.costs}#manage-context-proactively`,
      }
    },
  },
  {
    id: 'large-lockfile-readable',
    run(s) {
      const deny = SCOPES.flatMap((sc) => s.settings[sc].permissions?.deny ?? [])
      const open = s.lockfiles.filter((l) => !deny.some((rule) => String(rule).includes(l.name)))
      if (!open.length) return null
      return {
        severity: 'info',
        title: 'Large lockfiles can be read in full',
        detail:
          open.map((l) => `${l.name} (${Math.round(l.bytes / 1000)} KB)`).join('; ') +
          '. A model that opens one spends tens of thousands of tokens on content it can grep instead. ' +
          'Deny rules are best-effort for search tools and do not cover reads through Bash.',
        doc: 'https://code.claude.com/docs/en/permissions.md',
        fixes: [{ scope: 'project', ops: [{ op: 'add', key: 'permissions.deny', values: open.map((l) => `Read(./${l.name})`) }] }],
      }
    },
  },
  {
    id: 'duplicate-skills',
    run(s) {
      const dup = s.userSkillNames.filter((n) => s.projectSkillNames.includes(n))
      if (!dup.length) return null
      return {
        severity: 'info',
        title: 'The same skill exists at user and project level',
        detail: `${dup.join(', ')}. Each copy adds a description to context; keep the one you want.`,
        doc: DOCS.skills,
      }
    },
  },
  {
    id: 'mcp-output-limit-raised',
    run(s) {
      const n = Number(s.env.MAX_MCP_OUTPUT_TOKENS)
      if (!Number.isFinite(n) || n <= 50000) return null
      return {
        severity: 'info',
        title: 'MCP tool output limit is raised',
        detail:
          `MAX_MCP_OUTPUT_TOKENS is ${n.toLocaleString('en')}. A single tool result can add that much ` +
          'to the context, and it is re-read on every later request. Raise it only for a server that ' +
          'needs it.',
        doc: 'https://code.claude.com/docs/en/env-vars.md',
      }
    },
  },
  {
    id: 'auto-compact-off',
    run(s) {
      const viaEnv = truthy(s.env.DISABLE_AUTO_COMPACT)
      const scopes = SCOPES.filter((sc) => s.settings[sc].autoCompactEnabled === false)
      if (!viaEnv && !scopes.length) return null
      const where = [...(viaEnv ? ['DISABLE_AUTO_COMPACT'] : []), ...scopes.map((sc) => `autoCompactEnabled: false in ${sc} settings`)]
      return {
        severity: 'warn',
        title: 'Auto-compaction is off',
        detail:
          `${where.join('; ')}. Without it, every request carries the whole history until the model ` +
          'window fills, and idle compaction is off too. /compact still works by hand.',
        doc: `${DOCS.model}#set-the-auto-compact-window`,
        fixes: scopes.map((scope) => ({ scope, ops: [{ op: 'unset', key: 'autoCompactEnabled' }] })),
      }
    },
  },
  {
    id: 'idle-compaction-off',
    since: '2.1.290',
    run(s) {
      const scopes = SCOPES.filter((sc) => s.settings[sc].idleCompaction === false)
      if (!scopes.length) return null
      return {
        severity: 'info',
        title: 'Idle compaction is off',
        detail:
          `\`idleCompaction: false\` in ${scopes.join(', ')} settings. Idle compaction compacts a long ` +
          'conversation (200K+ tokens by default) shortly before its one-hour prompt cache expires, ' +
          'so coming back after a break does not re-read the whole history uncached.',
        doc: `${DOCS.settings.replace('settings.md', 'settings-reference.md')}#idlecompaction`,
        fixes: scopes.map((scope) => ({ scope, ops: [{ op: 'unset', key: 'idleCompaction' }] })),
      }
    },
  },
  {
    id: 'tool-search-off',
    run(s) {
      if (String(s.env.ENABLE_TOOL_SEARCH ?? '').toLowerCase() !== 'false') return null
      return {
        severity: s.mcpServers ? 'warn' : 'info',
        title: 'MCP tool search is off',
        detail:
          'ENABLE_TOOL_SEARCH=false loads every MCP tool definition into every request instead of ' +
          `deferring them until used${s.mcpServers ? ` (${s.mcpServers} MCP servers configured)` : ''}. ` +
          'Unset it, or use `auto` to defer once definitions pass 10% of the window.',
        doc: 'https://code.claude.com/docs/en/mcp.md#configure-tool-search',
      }
    },
  },
  {
    id: 'bash-output-raised',
    run(s) {
      const setting = SCOPES.map((sc) => s.settings[sc].bashOutputMaxChars).find((v) => v !== undefined)
      const value = Number(setting ?? s.env.BASH_MAX_OUTPUT_LENGTH)
      if (!(value > 30000)) return null
      return {
        severity: 'info',
        title: 'Bash output limit is raised',
        detail:
          `${setting !== undefined ? 'bashOutputMaxChars' : 'BASH_MAX_OUTPUT_LENGTH'} is ${value} ` +
          '(default 30,000 characters). Long command output stays in context for the rest of the ' +
          'conversation and is re-sent with every request.',
        doc: 'https://code.claude.com/docs/en/tools-reference.md#output-limits',
      }
    },
  },
  {
    id: 'no-statusline',
    run(s) {
      if (SCOPES.some((sc) => s.settings[sc].statusLine)) return null
      return {
        severity: 'info',
        title: 'No status line',
        detail:
          'A status line can show context fill and prompt-cache state (`context_window` and ' +
          '`prompt_cache` fields), which is the easiest way to see when to /clear or compact. The ' +
          'fix installs a small script that shows, on one quiet line, the model, folder and branch, ' +
          'the tokens in context against the point where Claude Code compacts, how long the prompt ' +
          'cache stays warm, the 5-hour and weekly limits with "→ 100% in" when at the recent pace ' +
          'they run out before the reset, and the session cost. It needs jq and is a plain file you can edit. ' +
          'Another way to see the same thing: the token-weather mod in anthropics/claude-code-playground ' +
          '(claude-code/mods/token-weather) draws a context forecast in the band above the prompt. It ' +
          'needs Claude Code 2.1.287 or later, is shared as-is and is not an official product; ' +
          'install it from a clone with `claude plugin marketplace add ./` in the mods folder.',
        doc: 'https://code.claude.com/docs/en/statusline.md',
        fixes: [
          { scope: 'user', script: 'statusline.sh' },
          {
            scope: 'user',
            ops: [
              {
                op: 'set',
                key: 'statusLine',
                value: { type: 'command', command: `${s.configDir ?? '~/.claude'}/tokendoctor-statusline.sh`, refreshInterval: 30 },
              },
            ],
          },
        ],
      }
    },
  },
]

export function runRules(snapshot) {
  const findings = []
  for (const rule of RULES) {
    if (rule.since && snapshot.version && compareVersions(snapshot.version, rule.since) < 0) continue
    const f = rule.run(snapshot)
    if (f) findings.push({ id: rule.id, ...f })
  }
  const order = { error: 0, warn: 1, info: 2 }
  return findings.sort((a, b) => order[a.severity] - order[b.severity])
}

export const ruleIds = RULES.map((r) => r.id)
