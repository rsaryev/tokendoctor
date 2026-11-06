---
name: audit
description: Audit this Claude Code setup for settings that waste tokens or silently do nothing.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-audit *), Bash(tokendoctor-dashboard *), Bash(tokendoctor-selfcheck --log *), WebFetch(domain:code.claude.com), Read, Glob
argument-hint: [project-dir]
---

Audit the Claude Code configuration for the current project (or `$ARGUMENTS` if given).

1. Run `tokendoctor-audit --json` (add `--project <dir>` when an argument was given). It is read-only
   and reports the Claude Code version, what it found, and a list of findings, each with a
   severity, an explanation and a documentation link.
2. Present the findings grouped by severity: errors first (settings that are wrong or ignored),
   then warnings, then info. For each, give one or two sentences in plain words and the doc link.
   Do not restate the whole detail text.
3. Be honest about limits: the audit checks configuration against documented behaviour. It does
   not measure savings, so state no percentages. Point to `/usage` (usage breakdown and
   recommendations) and `/context` (what is loaded now) for measuring.
4. Say which findings have an automatic fix (those with a `fixes` list) and offer
   `/tokendoctor fix <finding-id>` for them. Never edit files from this skill.
5. Review what Claude is told to do, not only how it is configured: read this project's memory
   (`~/.claude/projects/<project path with / as ->/memory/`, its `MEMORY.md` and the files it
   lists) and the instruction files (`~/.claude/CLAUDE.md`, `~/.claude/rules/`, the project's
   `CLAUDE.md` and `.claude/rules/`). Use your own judgment: point out anything there that makes
   Claude spend more than the work needs, contradicts the settings or another instruction, is stale,
   or is unsafe to keep. Quote `file:line` and say how to rewrite it. Where an instruction is
   plainly the person's own choice, show what it costs and leave the choice to them.
6. **Read the docs as they are today.** The audit checked every settings key and `env` variable
   against Claude Code's current settings reference and variable list (`facts.docs` says when they
   were read; null means offline with no copy, so those checks were skipped: say so). To explain a
   finding beyond its detail, or to answer a question about a setting, read its `doc` link: every
   page is served as Markdown at that URL (`…/docs/en/<page>.md`), and
   `https://code.claude.com/docs/llms.txt` indexes them all. Prefer this to memory or to a mirror
   such as context7: it is the text of the current release, while mirrors re-index on their own
   schedule.
7. **See what really loaded.** Findings from a debug log (`facts.debugLog` gives its time) come from a
   `claude --debug` run of the last day. To check now, offer `tokendoctor-selfcheck`: it starts
   `claude -p` once in this project on Haiku, with no saved session (one small request,
   a few cents at most), and reports which copy of tokendoctor loaded and in which tier, whether the
   built-in guard was seated, mods hooking compaction ahead of it, skipped hooks, the window Claude
   Code really compacts at, and a skill listing over its budget. Run it only after the person says
   yes; `tokendoctor-selfcheck --log <file>` reads a log they already have, at no cost.
8. If `facts.version` is null, say the Claude Code version could not be read and that rules which
   depend on a minimum version were still applied.
9. Build the usage dashboard: run `tokendoctor-dashboard --open`. It reads every transcript on this
   machine (usage figures only, never message text), writes one HTML file with no network use, and
   opens it: spend by day, by kind of token, model, reasoning effort, main thread and each subagent
   type, context size, project, hour of the week, and the largest sessions, with filters. Give the
   path it prints, and tie one or two of its numbers to the findings above (for example the share of
   spend that was the conversation re-read from the cache, or above 200K tokens of context).
