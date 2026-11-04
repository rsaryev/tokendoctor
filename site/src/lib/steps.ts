/**
 * The steps of the stack under the hero, each with what tokendoctor printed when it ran: real
 * output, trimmed to fit and with a temporary folder's path written as the settings file it stands
 * for. `see` is `tokendoctor-replay` on the author's last 30 days; `fix` is the audit and a dry run
 * on a fresh Claude Code config; `slide` is two compactions of one real session, a summary at night
 * and the slide in the afternoon; `look` is the author's own dashboard, its top, captured at 1440×900;
 * `undo` is `/tokendoctor` and `/tokendoctor undo`.
 */

/** A line: parts, each a tone and its text. Tones: '' plain, dim, hi, ok, bad, warn, acc. */
export type Line = [tone: string, text: string][]

/** A capture shown in place of the printed lines: 16:10, edge to edge, enlarged on a click. */
export type Shot = { src: string; alt: string; width: number; height: number }

export type Step = { kicker: string; title: string; text: string; command: string; panel: Line[]; shot?: Shot }

const plain = (text: string): Line => [['', text]]

export const STEPS: Step[] = [
  {
    kicker: '1 · see',
    title: 'Your number first',
    text: 'Replays your own sessions at smaller windows, before anything changes.',
    command: '/tokendoctor:sessions',
    panel: [
      [
        ['dim', '$ '],
        ['', 'tokendoctor-replay --days 30'],
      ],
      [
        ['hi', '195 sessions'],
        ['', ' in the last 30 days. Had Claude Code compacted at a smaller window:'],
      ],
      [
        ['', '   200K   '],
        ['ok', '24.9%'],
        ['', ' of all cost saved  '],
        ['dim', '(81 sessions affected, 612 compactions more)'],
      ],
      [
        ['', '   300K   '],
        ['ok', '21.7%'],
        ['', ' of all cost saved  '],
        ['dim', '(66 sessions affected, 260 compactions more)'],
      ],
      [
        ['', '   400K   '],
        ['ok', '16.5%'],
        ['', ' of all cost saved  '],
        ['dim', '(51 sessions affected, 135 compactions more)'],
      ],
      [
        ['', '   600K   '],
        ['ok', '10.8%'],
        ['', ' of all cost saved  '],
        ['dim', '(28 sessions affected, 45 compactions more)'],
      ],
      [['dim', 'An estimate: it cannot see the work a model does again after a summary.']],
    ],
  },
  {
    kicker: '2 · look',
    title: 'Every token, on one page',
    text: 'By day, model, effort, main thread and each subagent, context size and project. One local file.',
    command: '/tokendoctor:dashboard',
    panel: [],
    shot: {
      src: '/dashboard.webp',
      alt: "The author's tokendoctor dashboard: 57% of the spend was Claude re-reading the conversation",
      width: 1600,
      height: 1000,
    },
  },
  {
    kicker: '3 · fix',
    title: 'Fixes as a diff',
    text: '31 checks against the docs. Nothing is written until you say so.',
    command: '/tokendoctor:optimize',
    panel: [
      [
        ['warn', '[warn] '],
        ['hi', 'compact-window-unset'],
        ['', ': No auto-compact window is set'],
      ],
      [['dim', '  code.claude.com/docs/en/model-config.md']],
      plain(''),
      [
        ['dim', '$ '],
        ['', 'tokendoctor-apply compact-window-unset'],
      ],
      plain('Would change (user): ~/.claude/settings.json'),
      [['bad', '- {}']],
      [['ok', '+ {']],
      [['ok', '+   "autoCompactWindow": 400000']],
      [['ok', '+ }']],
      [['dim', 'Dry run. Re-run with --write to apply.']],
    ],
  },
  {
    kicker: '4 · slide',
    title: 'Slide, don’t summarize',
    text: 'Old tool outputs go, the conversation stays word for word. No pause.',
    command: '/tokendoctor slide on',
    panel: [
      [['dim', 'One session, the same size:']],
      [
        ['dim', '03:36  '],
        ['', "Claude Code's summary   "],
        ['', '367K → 35K   '],
        ['bad', '65.3 s'],
      ],
      [
        ['dim', '17:42  '],
        ['', "tokendoctor's slide     "],
        ['', '368K → 36K   '],
        ['ok', '0.04 s'],
      ],
    ],
  },
  {
    kicker: '5 · undo',
    title: 'Undo anything',
    text: 'Every setting by name, every change reversible. Costs no tokens.',
    command: '/tokendoctor undo',
    panel: [
      [
        ['dim', '> '],
        ['', '/tokendoctor'],
      ],
      [['hi', 'tokendoctor: settings']],
      [
        ['', '  window      '],
        ['acc', '400K     '],
        ['dim', ' tokens in context before auto-compaction'],
      ],
      [
        ['', '  slide       '],
        ['acc', 'on       '],
        ['dim', ' elide old tool outputs instead of summarizing'],
      ],
      [
        ['', '  effort      '],
        ['acc', 'medium   '],
        ['dim', ' reasoning effort'],
      ],
      [
        ['', '  subagents   '],
        ['acc', 'sonnet   '],
        ['dim', ' model for subagents without their own'],
      ],
      plain(''),
      [
        ['dim', '> '],
        ['', '/tokendoctor undo'],
      ],
      [
        ['', '   1  01 Nov at 04:35  user   slide: '],
        ['bad', 'off'],
        ['', ' → '],
        ['ok', 'on'],
      ],
      [
        ['', '   2  01 Nov at 04:35  user   slide: '],
        ['bad', 'on'],
        ['', ' → '],
        ['ok', 'off'],
      ],
    ],
  },
]
