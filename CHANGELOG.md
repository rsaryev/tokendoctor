# Changelog

## 0.5.0

- Cost weights follow the API price list per model: cache reads are 0.05 of input on Opus 5.5 and
  Sonnet 5.5 and 0.025 on Fable 5.1 (0.1 elsewhere), and Haiku 5.5 charges 5x on a prompt over 100K
  tokens. On an Opus 5.5 setup this lowers every figure that is mostly cache reads, such as the
  share spent with a very full context. Recorded days are recorded again while their transcripts
  last.
- `--days` counts the turns made in the window. It used to count every turn of a transcript
  touched in the window, so a long session that started earlier was counted whole.
  `tokendoctor-sessions --since/--until` picks exact days.
- `/tokendoctor:bench` and `tokendoctor-bench`: save a before/after snapshot (totals and daily rows,
  no project names or paths) and compare them on per-turn and share measures, per machine and
  combined.
- `subagents-on-top-model` counts every subagent type in its headline, not only those over 5%.
- `explore-default-model`: the built-in Explore runs on the main model (Opus when that is Fable), so
  it is no longer reported on a Sonnet or Haiku setup. `CLAUDE_CODE_SUBAGENT_MODEL` does not move
  Explore, Plan or forks, and the findings now say so.
- New: `effort-above-default` (a level saved per model by `/effort` above that model's default) and
  `effort-user-key-ignored` (a top-level `effortLevel` in user settings, which Opus 5.5 does not
  use). `tokendoctor-set` and the optimize tools change `modelSettings.<model>.effortLevel` and
  `.autoCompactWindow`, and the `settings` tool lists the level saved for each model.
- Dry runs show a real line diff with the line before each change. A change to a line that also
  appears elsewhere in the file used to show as "(no change)". `unset` no longer leaves empty
  objects behind.
- `bashOutputMaxChars` accepts 4000 to 128000, the range Claude Code clamps to;
  `CLAUDE_CODE_EFFORT_LEVEL` accepts `auto`. The advisor rank check applies to aliases only, as the
  pairing table has exceptions for older versions. Four doc links pointed at missing anchors.

## 0.4.1

- A compact status line, no bar: `Opus 5.5 · api main* · 120k/367k · cache 1h · 5h 51% · week 35% · $24`.
  Tokens are shown against where Claude Code actually compacts (the window less about 33K), coloured
  from half full. `cache 1h` is how long the prompt cache stays warm, `cache cold in 3m` in its last
  minutes, `cache cold, resend 350k` once cold. A limit adds `→ 100% in 48m` only when, at the recent
  pace (5h: the last hour, week: the last day; kept in `~/.claude/tokendoctor/pace.log`), it runs out
  before it resets.
- The `no-statusline` fix sets `refreshInterval: 30` so the countdowns move while you are idle.

## 0.4.0

- `/tokendoctor:optimize`: an agent that measures, proposes and applies setting changes through five
  tools from the plugin's hooks module (`metrics`, `settings`, `config_list`, `config_set`,
  `set_setting`). Changes run only after the person picks Apply in a dialog that shows the diff.
- `tokendoctor-set` changes any setting on the tunable list (`lib/tunables.mjs`), dry run first.
- `/tokendoctor:sessions` and `tokendoctor-sessions`: measure where tokens went from the local
  transcripts, with findings `late-compaction`, `subagents-on-top-model`, `long-sessions`,
  `idle-cache-rebuilds` and `images-read-repeatedly`. Read-only; never reads message text.
- `tokendoctor-sessions --by day|week` shows the trend. An async SessionStart hook records each finished
  day to `~/.claude/tokendoctor/history.jsonl`, so the trend outlives transcript cleanup.
- New findings: `auto-compact-off`, `idle-compaction-off`, `tool-search-off`, `bash-output-raised`.
- `advisor-inactive` also names `DO_NOT_TRACK`, `DISABLE_GROWTHBOOK` and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, which turn off the feature-flag fetch the advisor needs.
- `instructions-long` says Explore and Plan start without CLAUDE.md; `context-surface` says
  `skillOverrides` does not apply to plugin skills.
- The status line reads `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (`400k` form too) and
  `modelSettings.<model>.autoCompactWindow`, shows 5h and 7d rate limits on Pro and Max, and shows `--`
  right after /compact instead of a stale count.
- The status line counts the tokens in context from `current_usage` (cache reads and writes included),
  falling back to `total_input_tokens`, and reads every field in one `jq` pass.
- `main-model-expensive` no longer suggests running Sonnet with an Opus advisor.
- `compact-window-unset` now sets `autoCompactWindow` to 400,000 instead of 300,000.

## 0.3.0

- Renamed to `tokendoctor`, matching the repository and the domain. Install with
  `claude plugin marketplace add rsaryev/tokendoctor` and `claude plugin install tokendoctor@tokendoctor`.
  The skills are `/tokendoctor:audit` and `/tokendoctor:apply`; the shell commands are `tokendoctor-audit`
  and `tokendoctor-apply`; the status line script installs as `tokendoctor-statusline.sh` and backups end
  in `.tokendoctor-<timestamp>.bak`.
- This changes the plugin's id: remove `token-doctor` (`claude plugin marketplace remove token-doctor`)
  and install again.

## 0.2.3

- The repository moved to github.com/rsaryev/tokendoctor. Install with
  `claude plugin marketplace add rsaryev/tokendoctor`; the plugin is still `token-doctor@token-doctor`.
  The old address redirects.

## 0.2.2

- The dry run for `every-tool-hooks` lists what is removed (`remove 1 "*" hook from PreToolUse: <command>`)
  instead of stray lines of JSON.

## 0.2.1

- The `no-statusline` finding also points at the `token-weather` mod from anthropics/claude-code-playground,
  with its requirements and the fact that it is shared as-is.

## 0.2.0

- `no-statusline` now has a fix: it installs a small status line script (context bar against your
  auto-compact window, cache hit rate with a cold marker, session cost) and points `statusLine` at it.
- New rule `fast-mode-enabled`: fast mode saved as a default; the fix makes it a per-session opt-in.
- New rule `code-intelligence-missing`: a typed project without the matching language server plugin.
- `every-tool-hooks` also covers PostToolUseFailure and PermissionRequest and can drop the `*` hooks
  after a dry run.
- Sharper advice: `instructions-long` names path-scoped rules and skills (imports do not reduce
  context) and `context-surface` notes that MCP tool definitions are deferred by default.
- 27 rules.

## 0.1.1

- The plugin's homepage is now https://tokendoctor.dev, with a landing page in `site/`.
- The changelog and README state the right rule count (25).

## 0.1.0

First release.

- `/token-doctor:audit` and `/token-doctor:apply` skills, plus `token-doctor-audit` and
  `token-doctor-apply` commands for the shell.
- 25 rules covering compaction, caching, subagent and default models, advisor, instruction files,
  skills, plugins, MCP, hooks and generated directories, each linked to its documentation page.
- Fixes are dry-run first, back the old file up, and never overwrite an existing agent.
- Three generic subagent templates: `Explore`, `test-runner`, `docs-lookup`.
