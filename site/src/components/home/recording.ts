// The run the demo replays: the output of tokendoctor-audit and tokendoctor-apply against a
// sandbox config with a few real mistakes, trimmed to the findings that fit the frame.

export type Kind = 'cmd' | 'error' | 'warn' | 'info' | 'dim' | 'ok' | 'del' | 'plain'
export interface Out {
  kind: Kind
  text: string
}

export const AUDIT = '/tokendoctor:audit'
export const APPLY = '/tokendoctor:apply compact-threshold-undocumented'

export const AUDIT_OUT: readonly Out[] = [
  { kind: 'error', text: '[error] compact-threshold-undocumented' },
  { kind: 'plain', text: '  autoCompactThreshold is not a documented setting. The real key is autoCompactWindow, so this one is most likely ignored.' },
  { kind: 'dim', text: '  fix: tokendoctor-apply compact-threshold-undocumented' },
  { kind: 'error', text: '[error] compact-env-bare-number' },
  { kind: 'plain', text: '  CLAUDE_CODE_AUTO_COMPACT_WINDOW is 80, below the 100,000 minimum. A bare number is tokens, not thousands.' },
  { kind: 'warn', text: '[warn]  effort-max-in-settings' },
  { kind: 'plain', text: '  effortLevel "max" is not accepted in settings. Use xhigh, or /effort max for one session.' },
  { kind: 'info', text: '[info]  explore-default-model' },
  { kind: 'plain', text: '  The built-in Explore agent runs on Opus for read-only search. A Haiku override is one command away.' },
  { kind: 'info', text: '[info]  heavy-dirs-not-denied' },
  { kind: 'plain', text: '  target (120 MB) is readable. permissions.deny Read rules keep it out of context.' },
  { kind: 'dim', text: '2 errors · 1 warning · 2 more worth a look. Each finding links to the docs page it rests on.' },
]

export const APPLY_OUT: readonly Out[] = [
  { kind: 'dim', text: 'Would change (user): ~/.claude/settings.json' },
  { kind: 'del', text: '-   "autoCompactThreshold": 150000,' },
  { kind: 'dim', text: 'Dry run. Nothing is written until you confirm.' },
  { kind: 'ok', text: 'Confirmed. Backup: settings.json.tokendoctor-2026-10-25T03-48-00-000Z.bak' },
  { kind: 'ok', text: 'Wrote ~/.claude/settings.json' },
]

export const HELP = [
  'Two commands, both read-only until you confirm:',
  '  /tokendoctor:audit                 list findings by severity',
  '  /tokendoctor:apply <finding-id>    dry run, confirm, write (with a backup)',
  '  /clear                              clear this screen',
]
