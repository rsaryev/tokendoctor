# Benchmark

Does tokendoctor help Claude Code on real work? Claude Code does a TypeScript project for Bun
against acceptance tests written in advance, which it may not change: as it ships, and after taking
tokendoctor's advice. The tests score the work, so a run is judged by what passes, not by what the
model says. Run it after a change to the advice or the slide (`hooks/window.ts`) and read the rows of
[HISTORY.md](HISTORY.md). The setup follows [llx's benchmark](https://github.com/rsaryev/llx-cli).

Two questions, two kinds of run:

Claude Code without tokendoctor does not change between our versions, so it is measured once and
kept as a baseline: `baselines.json` names the reference run of each task, model and window. By
default `run.ts` runs only tokendoctor's arm (`advised+slide`, or `factory+slide` with `--window`)
and its `summary.md` compares it with the baseline. Run a baseline again (`--arm factory`,
`--arm advised`) only when Claude Code or the model changes, then point `baselines.json` at it.

- **Before and after the advice** (`--arm factory --arm advised --arm advised+slide`):
  Claude Code as it ships against the same Claude Code after `tokendoctor-apply` applied every fix
  the audit offers it. Most of the advice pays off in long sessions, so this wants `week`.
- **A summary against a slide** (`--window 100000 --arm factory --arm factory+slide`): the smallest
  window Claude Code takes, so even a short task compacts.

For sessions you already had, `tokendoctor-replay` estimates what a smaller window would have saved
(no model calls; it cannot see the work a model does again after a summary, which these runs do).

## The tasks

- `tasks/week` (307 tests, 27 steps in one session): `workday`, then two more days in which a
  colleague's branch is merged over the code (the reference implementation of some modules, with
  bugs in it) and the model fixes it. Grows to the sizes where a compaction window matters.
  `node bench/scripts/make-week.mjs` builds it; its bugs are mutants of the reference that its tests
  just catch (each alone fails 1 to 8), chosen by a fixed seed.
- `tasks/workday` (307 tests, 7 steps in one session): shopkit's six modules and evalkit's four,
  asked for one request after another, as a day of work; about 250K of context at the end.
  `node bench/scripts/make-workday.mjs` builds it.
- `tasks/fixkit` (238 tests, the default): four finished libraries (an expression language, a
  SQL-like query, unified diffs and patches, cron schedules) with twelve bugs put in, three a module;
  40 tests fail. Finding them means reading most of the code and the 34K-character spec, so the
  context fills. `node bench/scripts/make-fixkit.mjs` builds it from evalkit's reference and checks
  that each bug alone fails a test.
- `tasks/evalkit` (238 tests): the same libraries from stubs. Longer and harder.
- `tasks/shopkit` (69 tests): six small modules. A quick check that nothing broke.

`evalkit` and `shopkit` come from llx's benchmark. Each task has `project/`, what Claude Code is
given, `ref/`, a reference that passes every test and is never given, and `task.json`, the prompt.
`bun bench/run.ts --task <task> --check` checks a task: the reference passes everything, and the
project as given passes next to nothing (stubs) or fails some tests (bugs).

## A run

```bash
claude setup-token        # once; put it in .env as CLAUDE_CODE_OAUTH_TOKEN=... (.env is git-ignored)
bun bench/run.ts --task week --repeat 2 --note "what this run is for"   # advised+slide against the baselines
bun bench/run.ts --task fixkit --window 100000 --arm factory --arm factory+slide --repeat 5
bun bench/run.ts --task week --model claude-sonnet-5-5
bun bench/run.ts --arm base=advised+slide@/tmp/tokendoctor-0.4.1 --arm new=advised+slide  # two versions
```

`--arm [label=]profile[+slide[:percent]][@folder]` names an arm: `factory` (Claude Code as it
ships) or `advised` (after every fix tokendoctor's audit offers it, applied with `tokendoctor-apply`),
and `+slide` for tokendoctor loaded with `--plugin-dir`, its slide on, down to `percent` (25 by
default); tokendoctor from this repository or a folder, with a label where two of a kind run
together. Each run copies `project/` into a fresh git repository in a temporary directory and runs
`claude -p` there, one request a step, each resumed from the last:

- in a Claude Code of its own: a fresh, empty config folder (`CLAUDE_CONFIG_DIR`) signed in with the
  token in `.env`, so none of your settings, CLAUDE.md, memory, plugins or sessions take part, and
  nothing of yours is written; `--strict-mcp-config` (no MCP servers). It shares your plan's rate
  limits, so `--parallel` is 2 by default;
- every effect allowed (`--permission-mode bypassPermissions`) but an edit of `test/`,
  `package.json` and `tsconfig.json`, and no subagents: the work stays in one context, where
  compaction happens (with them, the model gave each module to a subagent, no context filled, and
  the kind of subagent it picked decided the cost);
- `--window N` sets `autoCompactWindow` for every arm, over the profile's own (factory has none,
  advised has what the audit sets: 400000).

`--model` (`claude-haiku-5-5`), `--effort`, `--timeout S` a step (1800), `--parallel N` (2) and
`--repeat N` (1) bound a run. After a run the fixed files are put back from the pristine copy, so an
edit through the shell cannot help, and a change to them is noted as tampered; then `bun test` is
the score. It needs `claude`, `bun` and `git` on the `PATH`, and spends what the runs cost.

## What a run is judged by

- **solved**: every test passed (and how many did; for a task of steps, after each step too);
- **cost $**: what Claude Code reports for the session (`total_cost_usd`);
- **wall s**, **requests** (model requests) and **cache %** (the share of input read from the
  prompt cache);
- **compactions**, split into **summaries** (Claude Code's own) and **slides** (tokendoctor's), and
  **compact s**, the seconds they took;
- **max context**, **reads** and **re-reads** (a file read again: what a summary or a slide lost
  and the model fetched back), **edits**, **failed tools**, and whether the fixed files were changed
  (**tampered**).

## The results

Everything a run leaves is kept. Only `run.json` and `summary.md` go into git; the rest stays on
this machine, since Claude Code writes paths and account details into it:

```text
results/<date>_<time>-<task>/
  run.json        what was run and every result
  summary.md      the same as tables
  <arm>-<n>/      events.jsonl.gz, transcript.jsonl.gz, test.txt.gz, src.tar.gz, answer.md,
                  settings.json (what the advice wrote, for advised arms)
```

`HISTORY.md` is made again from every `run.json` after each run (`bun bench/run.ts --history`).

### Before and after: a week of work

`week`, Haiku 5.5, 3 runs per arm, each profile's own window. `factory` is Claude Code as it ships
(no compaction: its context reached 396K to 680K); `advised` has every fix the audit offers applied
(a 400K window, so one summary per run); `advised+slide` adds the slide. Every run passed 307/307.

| Arm | Cost, median (range) | Time, median | Requests | Compactions | Waiting on them |
| --- | --- | --- | --- | --- | --- |
| factory | $3.18 ($2.15–3.80) | 1395 s | 106–140 | none | — |
| advised | $2.88 (−9%; $1.79–3.33) | 1624 s (+16%) | 133–250 | 1 summary | 27–32 s |
| advised+slide (slide v1) | $2.52 (**−21%**; $1.96–2.56) | 1380 s (−1%) | 113–150 | 1–2 slides | under 1 s |
| advised+slide (slide v5, 2 runs) | $2.82 (−11%; $1.92–3.73) | 1549 s (+11%) | 96–211 | 1 slide | under 1 s |

The window alone saves little here and costs time: a summary late in the week makes the model read
its files again. With the slide the same advice is cheaper in every run than the median factory run,
and as fast. Three runs a side are few, and the spread is wide; read the numbers as a direction.

Slide v5 ([2026-11-01_2232](results/2026-11-01_2232-week/summary.md), 2 runs against the same
baselines): $1.92 and $3.73, 1302 s and 1796 s, 307/307 both, one slide each (355–365K to a real
104–115K) and no summary. The two runs made 63 and 69 requests before the slide and 33 and 142 after
it, the second fighting `tsc --strict` errors it had started on before the slide; the median ($2.82,
−11% against factory, −2% against advised) says more about that spread than about the slide.

## The quick ones

`node bench/window.mjs` reads 60 files one by one and asks about them after, with no tests: the
cost of a slide against a summary (`--task read`), and what a summary loses (`--task recall`: the
files are deleted before the question). Its results are in `results/window-*.json`.
