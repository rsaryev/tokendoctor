---
name: apply
description: Apply one tokendoctor audit fix after showing the exact change. Moved to /tokendoctor fix <id>, which needs no model call.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-apply *)
argument-hint: <finding-id> [--scope user|project|local]
---

Apply the fix for the audit finding named in `$ARGUMENTS`. First say in one line that
`/tokendoctor fix <id>` does the same with no model call and that this command goes away in the next
release.

1. Run `tokendoctor-apply $ARGUMENTS` with no `--write`. It prints which files would change and a
   short -/+ summary, and changes nothing.
2. Show the user that output: the file path, the lines removed and added, and the scope (user
   settings affect every project; project settings are shared with the team through git; local
   settings are personal to this project).
3. Ask for confirmation. Do not proceed on silence or an unrelated reply.
4. After a clear yes, run the same command with `--write`. It copies an existing file to
   `<file>.tokendoctor-<timestamp>.bak` before writing, and never overwrites an existing agent file.
5. Report what was written and the backup path. Most settings apply to the running session, but
   say that a new session is the surest way to confirm, and that `/status` lists loaded files.

Never edit settings files by hand from this skill, and never pass `--write` before the user has
seen the dry run.
