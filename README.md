# token-doctor

[tokendoctor.dev](https://tokendoctor.dev) · [Changelog](CHANGELOG.md)

A Claude Code plugin that audits your setup for settings that waste tokens or silently do nothing,
and fixes them only after showing you the exact change.

It checks configuration against documented Claude Code behaviour. It does not measure savings, so
it never promises a percentage: use `/usage` and `/context` before and after to see the effect.

## Install

```bash
claude plugin marketplace add rsaryev/tokendoctor
claude plugin install token-doctor@token-doctor
```

To try it for one session without installing, clone the repository and run
`claude --plugin-dir /path/to/tokendoctor`.

Update with `claude plugin marketplace update token-doctor` and
`claude plugin update token-doctor@token-doctor`, then restart Claude Code.

## Use

| Command | What it does |
| --- | --- |
| `/token-doctor:audit` | Read-only. Lists findings by severity with a one-line explanation and a link to the documentation page each is based on. |
| `/token-doctor:apply <finding-id>` | Shows a dry run of the fix, asks you to confirm, then writes it. An existing file is copied to `<file>.token-doctor-<timestamp>.bak` first. |

Both skills are user-invoked only (`disable-model-invocation`), so their descriptions are not loaded
into your sessions' context. The plugin adds no hooks, no MCP servers and no always-on text.

The same checks run from a shell, because the plugin's `bin/` directory is on the Bash tool's PATH
while it is enabled:

```bash
token-doctor-audit [--project <dir>] [--json]
token-doctor-apply <finding-id> [--scope user|project|local] [--project <dir>] [--write]
```

## What it checks

Errors are settings that are wrong or ignored, warnings are likely to cost real money, and info is
worth a look. Rules that depend on a Claude Code release are skipped on older versions.

| Finding | Severity | What it catches |
| --- | --- | --- |
| `settings-unreadable` | error | A settings file that exists but is not valid JSON, so nothing in it applies. |
| `compact-threshold-undocumented` | error | `autoCompactThreshold` is not a Claude Code setting; the real key is `autoCompactWindow`. Fix removes it. |
| `compact-env-bare-number` | error | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` below 100,000 (a bare number is tokens, not thousands). |
| `compact-window-unset` | warn | Models with a native 1M window compact only near 967K by default. Fix sets 300,000. |
| `compact-window-small` | warn | A window so small that frequent compaction breaks the prompt cache. |
| `prompt-caching-disabled` | warn | A `DISABLE_PROMPT_CACHING*` variable is set. |
| `subagent-model-force` | warn | Every subagent, including reasoning ones, is forced onto one model. |
| `effort-max-in-settings` | warn | `effortLevel: "max"` is not accepted in settings. Fix uses `xhigh`. |
| `advisor-inactive` | warn | An advisor that will silently not run (telemetry off, advisor below the main model, tool disabled). |
| `explore-default-model` | info | The built-in Explore agent runs on Opus on many accounts. Fix installs a Haiku, read-only override. |
| `subagent-model-unset` | info | General-purpose subagents inherit an expensive main model. Fix sets `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`. |
| `main-model-expensive` | info | Opus or Fable as the default; suggests Sonnet with an advisor. |
| `agents-inherit-model` | info | Custom agents with no `model` run on the main model. |
| `heavy-dirs-not-denied` | info | Large `target/`, `dist/`, `build/`, `coverage/`, `.turbo/` directories not excluded from reads. Fix adds `permissions.deny` rules. |
| `large-lockfile-readable` | info | Lockfiles over 200 KB that a model can open in full. Fix adds a deny rule. |
| `instructions-long` | info | `CLAUDE.md` plus its `@imports` over 200 lines. Path-scoped `.claude/rules` and skills cut the cost; imports do not. |
| `compact-instructions-missing` | info | No `# Compact instructions` section to steer summaries. |
| `context-surface` | info | Many skills, plugins or MCP servers loaded in every session. |
| `duplicate-skills` | info | The same skill at user and project level. |
| `thinking-tokens-env` | info | `MAX_THINKING_TOKENS` is ignored on adaptive-reasoning models. |
| `prompt-cache-ttl-forced-short` | info | `FORCE_PROMPT_CACHING_5M` removes the one-hour cache some plans get. |
| `agent-teams-enabled` | info | Agent teams multiply token use per teammate. |
| `mcp-output-limit-raised` | info | A raised `MAX_MCP_OUTPUT_TOKENS`. |
| `every-tool-hooks` | info | Hooks matching `*` on a tool event (Pre/PostToolUse, PostToolUseFailure, PermissionRequest) start a process per call. Latency, not tokens. Fix drops them after a dry run; read the warning first if a tool shows agent status from them. |
| `fast-mode-enabled` | warn | `fastMode: true` saved as a default, so every session pays the higher fast-mode rate. Fix sets `fastModePerSessionOptIn`. |
| `code-intelligence-missing` | info | The project has files for a language with an official language-server plugin (`typescript-lsp`, `pyright-lsp`, `gopls-lsp`, …) and it is not enabled. |
| `no-statusline` | info | No status line. Fix installs `token-doctor-statusline.sh` (model, folder, branch, a context bar against your auto-compact window, cache hit rate, cost; needs `jq`) and points `statusLine` at it. The finding also mentions the `token-weather` mod from [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather) as an alternative (needs Claude Code 2.1.287+, shared as-is). |

`templates/statusline.sh` is the status line script the fix installs into your Claude config folder.
`templates/agents/` holds three generic subagents (`Explore`, `test-runner`, `docs-lookup`), each
pinned to a small model with read-only or narrow tools. A plugin cannot override a built-in agent
or ship `settings.json` keys such as `autoCompactWindow`, `env` or `permissions`, so the apply step
copies the template into `~/.claude/agents/` or `.claude/agents/` and edits your settings files
itself, with a backup.

## Limits

- It reads user, project and local settings files, `~/.claude.json` (only the MCP server names, to
  count them) and your skill and agent folders. It cannot see managed (organisation) settings.
- Whether a rule helps depends on your plan and workload. Findings explain the trade-off and link
  to the documentation; decide for yourself.
- Deny rules in `permissions.deny` are best-effort for search tools and do not stop a read through
  Bash.

## Develop

```bash
npm test          # node's built-in test runner, no dependencies
claude plugin validate .
```

The landing page lives in `site/` (`cd site && npm install && npm run dev`; `npm run build` prerenders
it, `node scripts/og.mjs` redraws the social card).

Rules are pure functions over a snapshot (`lib/rules.mjs`); reading the disk lives in
`lib/collect.mjs` and writing in `lib/apply.mjs`. Adding a rule means adding one entry and its test.
