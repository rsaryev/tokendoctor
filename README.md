<p align="center">
  <img src="docs/logo.svg" width="72" height="72" alt="tokendoctor">
</p>

<h1 align="center">tokendoctor</h1>

<p align="center">
  <strong>See where your Claude Code tokens go, and stop wasting them</strong>
</p>

<p align="center">
  A Claude Code plugin that measures your real spend, audits your setup against the docs, and changes a setting only after you approve the exact diff. Everything runs on your machine.
</p>

<p align="center">
  <a href="https://tokendoctor.dev">Website</a> ·
  <a href="#install">Install</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="tokendoctor in a real Claude Code session: /tokendoctor:sessions, then the daily trend" width="880">
</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Measure</strong><br>
      <code>/tokendoctor:sessions</code> reads your local transcripts: main thread against subagents, spend with a very full context, cache rebuilds. A daily history shows whether a change helped.
    </td>
    <td width="33%" valign="top">
      <strong>Audit</strong><br>
      <code>/tokendoctor:audit</code> runs 31 checks against documented Claude Code behaviour. Each finding links to the docs page it rests on.
    </td>
    <td width="33%" valign="top">
      <strong>Tune</strong><br>
      <code>/tokendoctor:optimize</code> proposes changes backed by your own numbers and applies the ones you pick, each through a dialog that shows it.
    </td>
  </tr>
</table>

## Install

```bash
claude plugin marketplace add rsaryev/tokendoctor
claude plugin install tokendoctor@tokendoctor
```

Update with `claude plugin marketplace update tokendoctor` and `claude plugin update tokendoctor@tokendoctor`, then restart Claude Code. To try it without installing, clone the repository and run `claude --plugin-dir /path/to/tokendoctor`.

## Use

| Command | What it does |
| --- | --- |
| `/tokendoctor:sessions [days]` | Where tokens went over the last 30 days (or `days`), with findings. Read-only. |
| `/tokendoctor:audit` | Setting checks by severity, each linked to the docs. Read-only. |
| `/tokendoctor:optimize [focus]` | Proposes up to five changes from your numbers and applies the ones you pick. |
| `/tokendoctor:apply <finding-id>` | Applies one audit fix after a dry run, with a backup of the file. |

`optimize` changes only settings on [the tunable list](lib/tunables.mjs) and `/config` rows. Every change opens a dialog that shows it and runs only on **Apply**; with no one to ask, as in a `-p` run, nothing changes. Hooks and permissions are never on the list.

<details>
<summary><strong>From a shell</strong></summary>

The plugin's `bin/` directory is on the Bash tool's PATH while it is enabled:

```bash
tokendoctor-audit [--project <dir>] [--json]
tokendoctor-sessions [--days <n>] [--project <dir>] [--by day|week] [--json]
tokendoctor-set --list | <key> <value>|--unset [--scope user|project|local] [--write]
tokendoctor-apply <finding-id> [--scope user|project|local] [--project <dir>] [--write]
```

</details>

<details>
<summary><strong>What it costs to keep installed</strong></summary>

The skills are user-invoked only (`disable-model-invocation`). `claude plugin details
tokendoctor@tokendoctor` estimates about 160 tokens of always-on cost for the four of them. The
plugin has no MCP server. Its hooks module adds the optimize tools (`mcp__tokendoctor__*`) behind
ToolSearch, so only their names are listed until `/tokendoctor:optimize` loads them. Its one command
hook runs `tokendoctor-record` in the background when a session starts. The hook is `async` and
prints nothing, so it adds no tokens. It appends each finished day's totals to
`~/.claude/tokendoctor/history.jsonl`, so the trend outlives Claude Code's transcript cleanup.

</details>

<details>
<summary><strong>The 31 setting checks</strong></summary>

Errors are settings that are wrong or ignored, warnings are likely to cost real money, and info is worth a look. Rules that depend on a Claude Code release are skipped on older versions.

| Finding | Severity | What it catches |
| --- | --- | --- |
| `settings-unreadable` | error | A settings file that exists but is not valid JSON, so nothing in it applies. |
| `compact-threshold-undocumented` | error | `autoCompactThreshold` is not a Claude Code setting; the real key is `autoCompactWindow`. Fix removes it. |
| `compact-env-bare-number` | error | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` below 100,000 (a bare number is tokens, not thousands). |
| `compact-window-unset` | warn | Models with a native 1M window compact only near 967K by default. Fix sets 400,000. |
| `compact-window-small` | warn | A window so small that frequent compaction breaks the prompt cache. |
| `prompt-caching-disabled` | warn | A `DISABLE_PROMPT_CACHING*` variable is set. |
| `subagent-model-force` | warn | Every subagent, including reasoning ones, is forced onto one model. |
| `effort-max-in-settings` | warn | `effortLevel: "max"` is not accepted in settings. Fix uses `xhigh`. |
| `advisor-inactive` | warn | An advisor that will silently not run (telemetry or feature-flag fetching off, advisor below the main model, tool disabled). |
| `fast-mode-enabled` | warn | `fastMode: true` saved as a default, so every session pays the higher fast-mode rate. Fix sets `fastModePerSessionOptIn`. |
| `auto-compact-off` | warn | `DISABLE_AUTO_COMPACT` or `autoCompactEnabled: false`: history grows until the model window fills. Fix unsets the setting. |
| `tool-search-off` | warn/info | `ENABLE_TOOL_SEARCH=false` loads every MCP tool definition into every request. |
| `explore-default-model` | info | The built-in Explore agent runs on Opus on many accounts. Fix installs a Haiku, read-only override. |
| `subagent-model-unset` | info | General-purpose subagents inherit an expensive main model. Fix sets `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`. |
| `main-model-expensive` | info | Opus or Fable as the default; suggests Sonnet. |
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
| `idle-compaction-off` | info | `idleCompaction: false`: a long conversation is not compacted before its one-hour cache expires. Fix unsets it. |
| `bash-output-raised` | info | `bashOutputMaxChars` or `BASH_MAX_OUTPUT_LENGTH` above the 30,000 default. |
| `code-intelligence-missing` | info | The project has files for a language with an official language-server plugin (`typescript-lsp`, `pyright-lsp`, `gopls-lsp`, …) and it is not enabled. |
| `no-statusline` | info | No status line. Fix installs `tokendoctor-statusline.sh` (model, folder, branch, a context bar against your auto-compact window, cache hit rate, 5h and 7d rate limits, cost; needs `jq`) and points `statusLine` at it. The finding also mentions the `token-weather` mod from [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather) as an alternative (needs Claude Code 2.1.287+, shared as-is). |

`templates/statusline.sh` is the status line script the fix installs into your Claude config folder.
`templates/agents/` holds three generic subagents (`Explore`, `test-runner`, `docs-lookup`), each
pinned to a small model with read-only or narrow tools. A plugin cannot override a built-in agent
or ship `settings.json` keys such as `autoCompactWindow`, `env` or `permissions`, so the apply step
copies the template into `~/.claude/agents/` or `.claude/agents/` and edits your settings files
itself, with a backup.

</details>

<details>
<summary><strong>What the session report finds</strong></summary>

| Finding | Severity | What it catches |
| --- | --- | --- |
| `late-compaction` | warn | Over 30% of main-thread cost spent with more than 400K tokens in context. |
| `subagents-on-top-model` | warn | Subagents on Opus or Fable making over 5% of all cost. Forks always run on the main model. |
| `long-sessions` | info | Sessions of 500+ turns, with their share of cost. |
| `idle-cache-rebuilds` | info | The prompt cache rebuilt after it expired during a break. |
| `images-read-repeatedly` | info | The same image read three or more times. |

</details>

<details>
<summary><strong>Limits</strong></summary>

- It reads user, project and local settings files, `~/.claude.json` (only the MCP server names, to
  count them) and your skill and agent folders. It cannot see managed (organisation) settings.
- Whether a rule helps depends on your plan and workload. Findings explain the trade-off and link
  to the documentation; decide for yourself.
- Deny rules in `permissions.deny` are best-effort for search tools and do not stop a read through
  Bash.
- Session costs are in input-token equivalents (relative API prices). Per-model prices are not
  applied, so the reports speak in shares, not dollars. Sessions on other machines and transcripts
  Claude Code has already cleaned up are not counted, except for days already in the history file.

</details>

<details>
<summary><strong>Develop</strong></summary>

```bash
npm test               # node's built-in test runner, no dependencies
npm run test:mod       # the hooks module's tests (claude plugin test)
claude plugin validate .
```

The landing page lives in `site/` (`cd site && npm install && npm run dev`; `npm run build` prerenders
it, `node scripts/og.mjs` redraws the social card). The demo is a real session recorded with
asciinema; `site/scripts/RECORDING.md` says how to record it again.

Rules are pure functions over a snapshot (`lib/rules.mjs`); reading the disk lives in
`lib/collect.mjs` and writing in `lib/apply.mjs`. Adding a rule means adding one entry and its test.
Session analysis is in `lib/sessions.mjs` and `lib/history.mjs`, the settings `tokendoctor-set` may
change in `lib/tunables.mjs`, and the optimize tools in `hooks/register.ts`.

</details>

## License

MIT
