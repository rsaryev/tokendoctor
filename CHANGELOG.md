# Changelog

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
