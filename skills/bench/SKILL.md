---
name: bench
description: Save a before/after snapshot of token use, or compare the saved ones, to judge whether a settings change helped.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-bench *)
argument-hint: save <label> [--machine <name>] [--until <date>] | compare
---

Save or compare before/after snapshots of this machine's token use. Arguments: `$ARGUMENTS`.

1. **save** (`save <label>`, for example `save before`): run
   `tokendoctor-bench save --label <label>` with any `--machine`, `--dir`, `--since`, `--until` or
   `--days` given. A snapshot covers the last 30 days by default. If settings were already changed
   today, ask whether "before" should end yesterday (`--until <yesterday>`), so the period holds only
   turns made before the change. Report the file path and the counts it prints.
2. **compare** (or no argument): run `tokendoctor-bench compare` (with `--dir` if given). Lead with
   the per-turn and share rows that moved, and say which direction each one should go. Totals
   depend on how much work each period had, so do not judge by them. Read a share change under
   about 2 points, or a per-turn change under about 5%, as no change.
3. Costs are input-token equivalents at API price ratios, with no per-model price applied. Speak
   in shares and per-turn figures, never dollars. A move from Opus to Sonnet shows as a lower
   "on Opus/Fable" share, not as a lower cost per turn.
4. Snapshots hold totals and daily rows only: no project names, paths or message text. They are
   saved under `~/.claude/tokendoctor/bench` unless `--dir` says otherwise. To compare machines,
   save on each machine with its own `--machine` name into one folder (a synced or git folder, or
   copy the files over). `compare` then shows each machine and all of them added together.
5. Say what this cannot show: periods differ in workload and task mix, so a before/after
   comparison suggests a cause but does not prove one. Transcripts Claude Code has cleaned up
   (after `cleanupPeriodDays`, 30 by default) cannot be saved later, so save "before" soon.

Never change settings from this skill.
