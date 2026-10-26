# Before/after: tokendoctor on its author's machines

Snapshots from `tokendoctor-bench save`: totals and daily rows only, no project names, paths or
message text. `tokendoctor-bench compare --dir bench` prints them side by side, per machine and
combined.

## work

- Before: 2026-09-26 to 2026-10-25 (`work-before-2026-09-26_2026-10-25.json`).
- Changed on 2026-10-26, around 10:45 local time (08:43–08:46 UTC):
  - `autoCompactWindow` set to 400000 (it applied at once);
  - `env.CLAUDE_CODE_SUBAGENT_MODEL` set to `sonnet` (from the next session on);
  - the tokendoctor status line installed.
  Then, around 11:11 local time (09:11 UTC), from the next session on:
  - `~/.claude/agents/Explore.md` installed (Haiku, read-only tools), replacing the built-in
    Explore, which ran on Opus;
  - the effort saved for `claude-opus-5-5` and `claude-opus-5` (`xhigh`) removed, so Opus 5.5 runs
    at its default `medium` (Opus 5 takes the top-level `effortLevel: medium`).
  Not changed: the main model (Opus 5.5).
  The plugin itself moved from 0.4.1 (GitHub) to 0.5.0 read from this folder.
- After: from 2026-10-27, in new sessions. Leave 2026-10-26 out of both periods, because it holds
  turns from before and after the change.

```bash
node bin/tokendoctor-bench save --label after --machine work --dir bench --since 2026-10-27
node bin/tokendoctor-bench compare --dir bench
```

## home

Save "before" there before changing anything, into this folder, with `--machine home`:

```bash
node bin/tokendoctor-bench save --label before --machine home --dir bench
```

If settings there were already changed, end the period the day before:
`--until <YYYY-MM-DD>`.
