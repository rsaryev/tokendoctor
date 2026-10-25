# Recording the landing demo

The demo on the landing is a real Claude Code session recorded with asciinema and replayed by
`asciinema-player` (`src/components/home/DemoFilm.tsx`). It is text, not video: crisp, selectable,
about 100 KB.

## Re-record

```bash
brew install asciinema agg            # asciinema 3.x, agg for a GIF
# Run from a plain terminal. Inside a Claude Code session, unset its variables first, or the
# nested claude may behave as a child session:
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION \
    -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID -u CLAUDE_EFFORT \
  asciinema rec --headless --window-size 110x36 --overwrite \
    -c "expect site/scripts/record-demo.exp $PWD" site/scripts/demo.raw.cast
python3 site/scripts/polish-cast.py site/scripts/demo.raw.cast site/public/demo.cast
agg --theme monokai --font-size 16 site/public/demo.cast demo.gif   # optional, for the README
```

`record-demo.exp` starts `claude --model sonnet` in the folder it is given, types
`/tokendoctor:sessions 30`, waits for the answer, then runs `!tokendoctor-sessions --by day --days 10`
(shell mode: the table itself is deterministic). Change what it types there.

## What we learned

- **expect only relays output while it is reading.** `sleep` between `send`s records nothing after
  the `spawn` line. Wait with `expect -timeout N eof {} timeout {}` (the `wait` proc in the script).
- **Use `--headless` and a fixed `--window-size`.** The recording does not depend on the terminal
  you run it from, and 110x36 fits the landing frame.
- **Fixed waits, then trim.** Waiting for the model by pattern is fragile in a TUI; wait generously
  (80 s for a skill) and let `polish-cast.py` cut the dead time.
- **Polish in the file, not in the player.** `polish-cast.py` keeps typing at a human pace, runs
  the model's thinking and streaming fast, adds a pause after each answer to read it, and adds
  chapter markers. The player then only sets a mild `speed`; an `idleTimeLimit` there would also
  cut the reading pauses.
- **Pick what goes in the frame.** A model answer can be wrong on camera (a first take had the
  audit claim a setting was missing when it was set). Prefer a skill answer you have read, plus a
  deterministic command (`!tokendoctor-sessions --by day`).
- **Check for private data before publishing.** The demo shows real usage shares and project
  names on purpose; scan the cast for home paths, emails, keys and session ids:
  `grep -E '/Users/|@|sk-ant|[0-9a-f]{8}-[0-9a-f]{4}' site/public/demo.cast`.
- **Strip the header.** asciinema writes the command (with local paths) and env into the first
  line; `polish-cast.py` writes a clean one.
- **To look at a frame**, cut the cast at a time and render it: `agg` to GIF, then
  `ffmpeg -i x.gif -vf "select=eq(n\,LAST)" -frames:v 1 x.png`.
