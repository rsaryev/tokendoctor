# Changelog

## Unreleased

- **Transcripts of any size.** `sessions`, `replay`, `dashboard` and the history hook read each
  transcript whole as one string, and a long session's passes the longest string Node makes
  (`0x1fffffe8` characters, about 512 MiB): a 782 MB transcript stopped every report with `Cannot create
  a string longer than 0x1fffffe8 characters`, and the SessionStart hook stopped recording history
  without a word. Now a transcript is read a line at a time and each row keeps only what is counted
  (`lib/transcript.mjs`). A line over 64 MiB is skipped: only a tool output or an attachment gets that
  long, never a response with usage. A file that cannot be read is left out with a line on stderr, not
  the whole report. The audit and `tokendoctor-selfcheck --log` read a debug log the same way, and the
  hook says why it failed on stderr (seen in verbose mode, never by Claude). On the author's 371 sessions
  (5.5 GB) every report is byte for byte the same as before, in half the time and 0.55 GB of memory
  instead of 2.7 to 3.2 GB; an 800 MB transcript reads in under a second.
- **The slide under a Team or Enterprise login.** Where Claude Code seats its built-in guard
  (`cc-plugin-sec-default`: any machine with managed settings, or a Team or Enterprise `/login`), the
  guard sends compaction past the mods a person installs (`on('session.compact', … next.to(e,
  'append'))` in anthropics/claude-code `mods/sec-default`), so the slide never ran and Claude Code
  summarized with no word. No other mod event can rewrite rows already in the conversation. Now:
  - the audit warns (`slide-blocked-by-guard`), `/tokendoctor` and `/tokendoctor slide` say why, and
    a session that starts with the slide on shows a toast;
  - `tokendoctor-org-install` installs tokendoctor as the machine's own mod, which runs after the
    guard: a root-owned copy in the system folder, a marketplace that loads it in place and
    `managed-settings.d/50-tokendoctor.json` with `appendPlugins` (an existing managed-settings.json
    is not touched). Dry run by default, one `sudo` command, `--uninstall` undoes it. Where the
    organization delivers server-managed settings or an MDM profile, files are ignored and it says to
    ask an administrator. The machine copy reads the options `/tokendoctor` writes.
  - Checked live on a Team login with the guard seated (Haiku 5.5, a 100K window, 40 files read):
    the machine copy's hook ran on every compaction; 5 of 6 slid in 4 to 9 ms (66K → 34K and the
    like) and one, with too little left to elide, fell back to a summary (12 s). The answer was right.
    A first probe with 14 large files never slid: at a 100K window each output was too big a share,
    and the slide handed every compaction to the summary, as it should.
- The slide also takes the compactions Claude Code starts on its own besides the threshold (idle
  compaction before the hour's cache expires); `/compact` and a plugin's `$.session.compact` still
  summarize.
- `/tokendoctor:sessions` counts the files read before a compaction and read again within the next
  10 requests, by kind: `rereads-after-compaction`. On the author's last 60 days: 1.31 files after a
  summary (32), 0.97 after a slide (349); at least one re-read after 28% of summaries and 19% of slides.
  Different sessions and work, not a controlled test.
- New checks: `compact-pct-override` (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`: where it sets the point, a
  warning below half, an error when not a percent), `skill-model-switch` (a skill whose frontmatter
  names another model reads the conversation uncached; `context: fork` avoids it), `opusplan-cache`
  (every plan-mode toggle is a model switch). `auto-compact-off` covers `DISABLE_COMPACT`;
  `compact-window-unset` stays quiet under `CLAUDE_CODE_DISABLE_1M_CONTEXT`; the main model falls back
  to `ANTHROPIC_DEFAULT_MODEL`.
- **Today's docs, not a frozen list.** The audit reads Claude Code's current settings reference and
  variable list from code.claude.com as Markdown (a day's cache, `--offline`), and flags keys the docs
  do not have (`settings-key-undocumented`), Claude-Code-style variables they do not list
  (`env-undocumented`) and keys newer than the installed release (`setting-needs-newer-version`). The
  audit and optimize skills read a finding's page before explaining it. `npm run docs:check` checks
  every name tokendoctor uses against the docs (27 keys and 29 variables today, all present).
- **What really loaded.** `tokendoctor-selfcheck` reads a debug log (one `claude -p` on Haiku with no
  saved session, or `--log <file>`): the tier tokendoctor loaded in, the guard, the mods on
  compaction in order, skipped hooks, the effective window, a skill listing over its budget. The
  audit reads a `claude --debug` log of the last day when there is one.
- `/tokendoctor` changes `idle-compact-at` (`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`), `compact-at`
  (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) and `max-effort` (`maxEffortLevel`); `window-env` takes `1m`.

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
- The published figures, measured again at list prices on the same UTC days: main-thread cost per
  request after a 400K window and Sonnet for subagents −38% (was −43% in the old weights; −40% with
  subagents); the month before replayed at 400K −33% of the main thread and −20% of all spend (was
  −27 to −40%). The headline is "up to 38% less" (was 40%). Context per request (412K → 219K) and
  the bench results, which use the cost Claude Code reports, do not change. The landing's day table
  now has all of 1 November, which was measured that afternoon.
- A summary compaction in the author's sessions takes 79 s on average, not 73 s: the earlier mean
  counted slides, which take no time, as summaries.
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
