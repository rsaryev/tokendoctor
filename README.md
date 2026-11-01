<p align="center">
  <img src="docs/logo.svg" width="72" height="72" alt="tokendoctor">
</p>

<h1 align="center">tokendoctor</h1>

<p align="center">
  <strong>The same Claude Code for up to 40% less</strong>
</p>

<p align="center">
  See what your Claude Code use overpays, fix it, undo it any time. Runs on your machine.
</p>

<p align="center">
  <a href="https://tokendoctor.dev">Website</a> ·
  <a href="#install">Install</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="tokendoctor in a real Claude Code session: /tokendoctor:sessions, then the daily trend" width="880">
</p>

| Measured on its author's six weeks of real use | |
|---|---|
| Cost per request, the month before against the week after a 400K window and Sonnet for subagents | **−43%** |
| Context per request | **412K → 219K** |
| The same sessions replayed at a 400K window: only the window changed | **−27 to −40%** |
| The slide against a summary, the same day of work ([bench](bench/README.md)) | **−19% cost, −33% time** |
| A week of work in [bench](bench/README.md) (27 steps), Claude Code as it ships against every fix applied and the slide | **−11 to −21% cost** (medians of 2 and 3 runs; single runs −40% to +17%), all tests pass |

**There is no one pill.** If your sessions rarely pass 400K tokens, the window changes nothing for
you; a summary that lands just before you finish can cost more than it saves; your models, effort
and work all move the number. So tokendoctor shows you yours first: `/tokendoctor:sessions` replays
your own sessions at smaller windows before anything changes.

<table>
  <tr>
    <td width="25%" valign="top">
      <strong>See</strong><br>
      <code>/tokendoctor:sessions</code> replays your own sessions at smaller windows and says what each would have saved, then where the tokens went.
    </td>
    <td width="25%" valign="top">
      <strong>Fix</strong><br>
      <code>/tokendoctor:optimize</code> runs 31 checks against the docs and applies the changes you pick, each shown as a diff first.
    </td>
    <td width="25%" valign="top">
      <strong>Slide</strong><br>
      <code>/tokendoctor slide on</code>: where Claude Code would summarize, old tool outputs go instead. No pause, the conversation stays word for word.
    </td>
    <td width="25%" valign="top">
      <strong>Undo</strong><br>
      <code>/tokendoctor undo</code> lists every change tokendoctor made and puts any one back. No model call, no tokens.
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
| `/tokendoctor:sessions [days]` | What a smaller window would have saved you (your sessions replayed), then where tokens went over the last 30 days (or `days`), with findings. Read-only. |
| `/tokendoctor:audit` | Setting checks by severity, each linked to the docs. Read-only. |
| `/tokendoctor:optimize [focus]` | Proposes up to five changes from your numbers and applies the ones you pick. |
| `/tokendoctor [name] [value]` | Shows the main settings, explains one or changes it. No model call, no tokens. |
| `/tokendoctor fix <finding-id>` | Applies one audit fix after showing it, with a backup of the file. |
| `/tokendoctor undo [n]` | Lists the changes tokendoctor made, newest first, and puts change `n` back. |

`/tokendoctor` is answered by the plugin itself, so it costs nothing. Tab completes the names
(`window`, `slide`, `cache`, `effort`, `model`, `subagents`, and `/tokendoctor all` for the rest) and
their values; `/tokendoctor window 400k` applies as typed, `/tokendoctor window reset` goes back to the
default, `--project` or `--local` writes there instead of your user settings. A model name must be an
alias (`opus`, `sonnet`, `haiku`) or a `claude-…` id.

`optimize` changes only settings on [the tunable list](lib/tunables.mjs) and `/config` rows. Every change opens a dialog that shows it and runs only on **Apply**; with no one to ask, as in a `-p` run, nothing changes. Hooks and permissions are never on the list.

<details>
<summary><strong>From a shell</strong></summary>

The plugin's `bin/` directory is on the Bash tool's PATH while it is enabled:

```bash
tokendoctor-audit [--project <dir>] [--json]
tokendoctor-sessions [--days <n>] [--project <dir>] [--by day|week] [--json]
tokendoctor-set --list | <key> <value>|--unset [--scope user|project|local] [--write]
tokendoctor-apply <finding-id> [--scope user|project|local] [--project <dir>] [--write]
tokendoctor-undo [--json] | <n> [--write]
tokendoctor-replay [--days <n>] [--window 200k,400k] [--json]   # what a smaller window would have saved
```

</details>

<details>
<summary><strong>What it costs to keep installed</strong></summary>

The skills are user-invoked only (`disable-model-invocation`). `claude plugin details
tokendoctor@tokendoctor` estimates about 160 tokens of always-on cost for the four of them. The
plugin has no MCP server. Its hooks module adds the optimize tools (`mcp__tokendoctor__*`) behind
ToolSearch, so only their names are listed until `/tokendoctor:optimize` loads them. `/tokendoctor`
and the slide run in the hooks module too, with no model call, so they add no tokens. Its one command
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
| `no-statusline` | info | No status line. Fix installs `tokendoctor-statusline.sh` and points `statusLine` at it (needs `jq`). One quiet line: `Opus 5.5 · api main* · 120k/367k · cache 1h · 5h 51% · week 35% · $24`. Tokens are shown against the point where Claude Code compacts; `cache 1h` is how long the prompt cache stays warm; a limit adds `→ 100% in 48m` only when, at the recent pace (5h: the last hour, week: the last day), it runs out before it resets. The finding also mentions the `token-weather` mod from [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather) as an alternative (needs Claude Code 2.1.287+, shared as-is). |

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
<summary><strong>Slide the window instead of compacting</strong></summary>

Off by default. With `/tokendoctor slide on` (or `tokendoctor-set tokendoctor.slide true --write`, or
`/tokendoctor:optimize`), where Claude Code would compact, the plugin's hooks module elides old tool
outputs into short pointers instead of summarizing, the way [llx](https://github.com/rsaryev/llx)
does. Every prompt, answer and decision stays word for word, and there is no summary pause.

- What goes first: reads made stale by a later read or edit of the same file, then what edits wrote
  (it is on disk), then the oldest outputs. The recent tail, outputs the model has not answered yet
  and Agent results stay.
- It frees down to `tokendoctor.slideTo` percent (default 25) of where Claude Code compacts, so slides
  are rare. Each one re-sends the context once, as a summary does; a pointer is never touched again.
- `/compact` still summarizes, and so does a slide that cannot free enough. Set a smaller window with
  `autoCompactWindow` (for example 400000) and the slide works from it.

In one real session, at the same size: Claude Code's summary took 367K to 35K in **65.3 s**; the slide
took 368K to 36K in **0.04 s**. Summaries in the author's real sessions take 73 s on average.

On [bench/](bench/README.md), Claude Code doing a TypeScript project against fixed acceptance tests,
Haiku 5.5, a 100K window so that it compacts several times (medians). A short task with one
compaction gains time but not money; the longer the work, the more the slide saves:

| Task | Arm | Tests passed | Cost | Time | Waiting on compactions |
| --- | --- | --- | --- | --- | --- |
| a day of work (7 requests, 307 tests), 2 runs | summary | 307/307 | $0.186 | 1141 s | 103–137 s |
| | slide | 307/307 | $0.151 (**−19%**) | 763 s (**−33%**) | under 1 s |
| evalkit (an eval harness, 238 tests), 5 and 3 runs | summary | 238/238 | $0.149 | 656 s | about 50 s |
| | slide | 238/238 | $0.096 (**−35%**) | 472 s (**−28%**) | under 1 s |
| fixkit (12 bugs to find, 238 tests), 5 runs | summary | 238/238 | $0.037 | 154 s | about 16 s |
| | slide | 238/238 | $0.039 (+6%) | 128 s (**−17%**) | under 1 s |

The earlier, smaller runs of `node bench/window.mjs` (60 files of 300 lines read one by one, then a
follow-up in the same session, 200K window) cost the same both ways:

| Model | Arm | Cost | Compactions | Answers right |
| --- | --- | --- | --- | --- |
| Haiku 5.5 (3 runs) | summary | $0.581 | 3 | 5/5 |
| Haiku 5.5 (3 runs) | slide to 25% | $0.580 | 3.7 | 5/5 |
| Sonnet 5.5 (1 run) | summary | $2.93 | 3 | 5/5 |
| Sonnet 5.5 (1 run) | slide to 25% | $2.99 | 3 | 5/5 |

What a summary loses, measured with `--task recall`: the session starts with five decisions from the
person, the files are deleted after reading, and the follow-up asks for the decisions and eight KEYs the
model noted. Claude Code's summary kept them all: 6/6 and 8/8 in every run on both models. The slide
did the same on Haiku 5.5 (3 runs, 2% dearer); on Sonnet 5.5 (1 run) it missed one KEY, which the
model skipped noting in its first reply after a slide. So far no test shows the slide answering better,
or worse: it saves time and money, not quality.

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
bun bench/run.ts --task fixkit --window 100000 --arm factory --arm factory+slide   # see bench/README.md
```

`test/private.test.mjs` fails if anything git would commit holds an API key or token, a home folder
path or a temporary folder of the machine: benchmark results come from runs on someone's account, so
only their summaries are committed and the transcripts stay local.

The landing page lives in `site/` (`cd site && npm install && npm run dev`; `npm run build` prerenders
it, `node scripts/og.mjs` redraws the social card). The demo is a real session recorded with
asciinema; `site/scripts/RECORDING.md` says how to record it again.

Rules are pure functions over a snapshot (`lib/rules.mjs`); reading the disk lives in
`lib/collect.mjs` and writing in `lib/apply.mjs`. Adding a rule means adding one entry and its test.
Session analysis is in `lib/sessions.mjs` and `lib/history.mjs`, the settings `tokendoctor-set` may
change in `lib/tunables.mjs`, the `/tokendoctor` command in `lib/console.mjs`, the replay in
`lib/replay.mjs`, the slide in `hooks/window.ts`, and the optimize tools in `hooks/register.ts`.

</details>

## License

MIT
