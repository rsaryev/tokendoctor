---
name: audit
description: Audit this Claude Code setup for settings that waste tokens or silently do nothing.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-audit *), Read, Glob
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
6. If `facts.version` is null, say the Claude Code version could not be read and that rules which
   depend on a minimum version were still applied.
