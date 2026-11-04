# Changelog

## 0.5.1

- Costs are dollars at each model's Claude API list price (`lib/prices.mjs`, from
  platform.claude.com/docs/en/about-claude/pricing, read 2026-11-04), in the dashboard, `sessions`,
  the replay, the findings and the daily history. Before, every model was weighed alike in
  input-token equivalents with cache reads at 0.1x, while Opus 5.5 and Sonnet 5.5 read the cache at
  0.05x and Fable 5.1 at 0.025x, and a Haiku token counted as much as an Opus one. On the author's
  history that overstated cache reads (75% of the spend; at list prices 57%) and understated output
  (10%; 16%). Thanks to the Reddit commenter who checked the weights against the pricing page.
- Requests Claude Code bills but does not write into transcripts (a summary compaction's own
  request, titles, WebFetch page reads) are counted: Claude Code's own session total from its
  `cost-state` lines, minus the transcripts' responses, where that total holds (it falls on a
  restart, and after /clear it can carry the session before); else the summaries are estimated. The
  dashboard shows them as "Not in transcripts" (6% on the author's history). Checked against the
  cost Claude Code reported on bench's 78 runs: equal to the cent on 77.
- Agents run by a workflow, whose transcripts sit one folder down in `subagents/workflows/`, are
  counted. They were missed before: 1,028 transcripts, 9% of the spend on the author's history.
- The published figures, measured again at list prices: cost per request after a 400K window and
  Sonnet for subagents −37% (was −43% in the old weights); the month before replayed at 400K −33% of
  the main thread and −20% of all spend (was −27 to −40%). Context per request and the bench
  results, which use the cost Claude Code reports, do not change.
- The daily history file is measured again in dollars for every day whose transcripts remain; the
  old file is kept beside it as `history.jsonl.before-0.5.1`.

## 0.5.0

- The README and the landing show the dashboard: the top of the author's own, captured at 1440×900;
  on the landing it is step 2, enlarged on a click.
- `/tokendoctor:dashboard` and `tokendoctor-dashboard [--days n] [--open]`: a local dashboard of
  every session on this machine, opened in the browser. It leads with what most of the spend was (on
  the author's history: 75% was the conversation read back from the cache), then spend by day, by
  kind of token, model, reasoning effort, main thread and each subagent type, main-thread context
  size, project, weekday and hour, and the largest sessions, with filters for period, thread and
  project. One HTML file with its fonts inside, no network; it reads usage figures, never message
  text. `/tokendoctor:audit` builds and opens it as its last step.
- Tried and dropped: a decision model (Jev, or Haiku without a key) that picks each subagent's model
  and effort from its brief. Replayed on 30 days of the author's sessions (452 subagents), it would
  have saved under 1%: the expensive subagents had heavy work, and Jev kept them on Opus at high
  effort. Against 74 of those briefs labeled by Opus, Jev agreed 31 times and Haiku 59. A brief alone
  is too little to judge from; this needs finer tuning (the lead agent's own context, escalating
  after a failure, what past runs needed) before it comes back. The code is on the local branch
  `experiment/agents-by-task`.
- The slide treats a Bash command that only prints files (`cat`, `sed -n '1,40p'`, `head`, `tail`,
  `nl`) as a read of them: once a later read or edit of the same file makes it stale, it goes first,
  as a stale Read does, and its pointer names the files. Turning such commands away to Read instead
  was measured and dropped: on `workday` (Haiku 5.5, 100K window, 2 runs) each refusal cost a
  request, +24% cost and +19% time against the slide alone (bench/results/2026-11-03_2214-workday).
- `tokendoctor-sessions --json` adds `usage`: calls and output per tool (main thread and subagents
  apart), Bash calls that only printed a file or slept, the files read most, and how large subagent
  runs grew. `/tokendoctor:sessions` and `/tokendoctor:optimize` draw their own recommendations from
  it, as a `/tokendoctor <name> <value>` line or a few lines for the project's memory or CLAUDE.md.
- `/tokendoctor:audit` also reads the project's memory and instruction files and points out what makes
  Claude spend more than the work needs, contradicts the settings, is stale or is unsafe to keep.

- `/tokendoctor`: the settings by short name, answered by the plugin with no model call. Alone it shows
  the main six and the audit's fixes; `/tokendoctor <name>` explains one, `/tokendoctor <name> <value>`
  applies it as typed (`400k`, `on`, `5m`, `reset`), `--project` or `--local` picks the file. Tab
  completes names, values and fix ids.
- `/tokendoctor fix <id>` replaces `/tokendoctor:apply`, which still works in this release.
- `/tokendoctor undo` lists the settings changes tokendoctor wrote (kept in
  `~/.claude/tokendoctor/changes.jsonl`), and `/tokendoctor undo <n>` puts one back, key by key, unless
  that key changed again since. `tokendoctor-undo` does the same from a shell.
- `model`, `advisorModel` and `env.CLAUDE_CODE_SUBAGENT_MODEL` take only a model alias or a `claude-…`
  id; any other word used to be written as the model name.
- `tokendoctor.slide` (off by default): where Claude Code compacts, old tool outputs are elided into
  pointers instead of summarizing the conversation, down to `tokendoctor.slideTo` percent (default 25)
  of where it compacts. Stale reads go first, then what edits wrote, then the oldest outputs; outputs
  the model has not answered yet stay. On a day of work at a 100K window (`bench/`, Haiku 5.5) it
  cost 19% less and took 33% less time than Claude Code's summary (evalkit: 35% and 28% less), with
  every test passing both ways; a summary pauses about 73 s, a slide under 1 s.
- The slide counts screenshots and thinking: a slid conversation carries neither, so what they took
  counts as freed (Haiku's answers can think 40–60K tokens each). Before, a session full of screenshots (the localix-desk tools) found too little
  text to elide and fell back to a summary. A slide now has to leave the context under 60% of where
  Claude Code compacts, and after a summary the next compaction slides again; before, one summary
  made every compaction after it a summary.
- `npm run test:mod` runs the hooks module's tests on a copy without `bench/`, whose task projects
  hold acceptance tests of their own.
- `tokendoctor-replay` replays your past sessions as if Claude Code had compacted at a smaller
  window and says what share of the cost it would have saved. It is an upper bound: it cannot see
  the work a model does again after a summary (a live run had 27 files read again after one).
- `/tokendoctor:sessions` opens with the replay: what a smaller window would have saved you.
- README and landing: one claim (the same Claude Code for up to 40% less), the numbers it rests on, and
  where it does not hold.
- `test/private.test.mjs`: fails if anything git would commit holds a key, a token or a machine path.
- `bench/`: a benchmark in the style of llx's. Claude Code does TypeScript projects against fixed
  acceptance tests in a config folder of its own, as it ships (`factory`) and after every fix the
  audit offers (`advised`), with or without the slide; results and history kept in git.
- `tokendoctor-set` and the `settings` tool know the plugin's own options
  (`pluginConfigs.tokendoctor@tokendoctor.options`).
- `metrics` reports the compaction window and whether the slide is on.

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
