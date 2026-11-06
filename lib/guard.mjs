// Whether the slide can run here, and what makes it run where it cannot.
//
// Claude Code seats a built-in mod, sec-default@builtin (`cc-plugin-sec-default`), ahead of every mod
// a person installs when the machine has managed settings or the session signs in with a Team or
// Enterprise /login (plugins/mods/admin.md#know-what-happens-by-default). Its `session.compact` hook
// is `next.to(e, 'append')`: compaction skips the mods a person installed, so the slide never runs and
// Claude Code summarizes as it would without tokendoctor. No other event lets a mod rewrite rows
// already in the conversation (`session.append` reaches only new rows, `turn.step` pins the messages).
//
// A mod that counts as the organization's runs where the guard sends the event on: listed in
// `appendPlugins`, enabled in managed settings, loaded in place from a marketplace directory that
// managed settings name by absolute path (plugins/mods/admin.md#install-your-organizations-mods).
// `tokendoctor-org-install` sets that up with a drop-in file in managed-settings.d, so an existing
// managed-settings.json is never touched.
//
// Pure: the callers read the files (bin/ with node:fs, the hooks module with $.fs).

export const ORG_MARKETPLACE = 'tokendoctor-org'
export const ORG_ID = `tokendoctor@${ORG_MARKETPLACE}`
export const USER_ID = 'tokendoctor@tokendoctor'
export const DROP_IN = '50-tokendoctor.json'

/** The system folder Claude Code reads managed settings files from (managed-settings.md). */
export function systemDir(platform = process.platform) {
  if (platform === 'darwin') return '/Library/Application Support/ClaudeCode'
  if (platform === 'win32') return 'C:\\Program Files\\ClaudeCode'
  return '/etc/claude-code'
}

const join = (platform, ...parts) => parts.join(platform === 'win32' ? '\\' : '/')

/** Where the installer puts the marketplace, the plugin copy and the drop-in. */
export function orgPaths(platform = process.platform) {
  const dir = systemDir(platform)
  const marketplace = join(platform, dir, ORG_MARKETPLACE)
  return {
    dir,
    marketplace,
    plugin: join(platform, marketplace, 'tokendoctor'),
    dropInDir: join(platform, dir, 'managed-settings.d'),
    dropIn: join(platform, dir, 'managed-settings.d', DROP_IN),
  }
}

/** The drop-in that makes the copy the organization's, run after the guard. */
export function dropInSettings(platform = process.platform) {
  return {
    extraKnownMarketplaces: {
      [ORG_MARKETPLACE]: { source: { source: 'directory', path: orgPaths(platform).marketplace } },
    },
    enabledPlugins: { [ORG_ID]: true },
    appendPlugins: [ORG_ID],
  }
}

export function marketplaceManifest() {
  return {
    name: ORG_MARKETPLACE,
    owner: { name: 'tokendoctor' },
    description: 'tokendoctor installed as this machine’s own mod, so its slide runs after the built-in guard.',
    plugins: [{ name: 'tokendoctor', source: './tokendoctor', description: 'tokendoctor, loaded in place' }],
  }
}

const has = (o) => o && typeof o === 'object' && Object.keys(o).length > 0
const isTeamOrg = (type) => typeof type === 'string' && /team|enterprise/i.test(type)

/**
 * @param {object} i
 * @param {object} [i.account]   `oauthAccount` from ~/.claude.json (organizationType)
 * @param {object} [i.env]       the environment the session starts with
 * @param {object} [i.managed]   the managed settings files merged (managed-settings.json + .d/*.json); {} when none
 * @param {boolean} [i.mdm]      a macOS profile or HKLM policy is present
 * @param {object} [i.remote]    the cached server-managed settings (~/.claude/remote-settings.json)
 * @param {string} [i.root]      the running copy's plugin root, when known
 * @param {string} [i.platform]
 */
export function guardState({ account, env = {}, managed = {}, mdm = false, remote = {}, root, platform = process.platform } = {}) {
  // A session on an API key, a long-lived token or a cloud provider is not a /login (admin.md).
  const otherCredential = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].find(
    (k) => env[k] !== undefined && env[k] !== '' && env[k] !== '0',
  )
  const teamLogin = !otherCredential && isTeamOrg(account?.organizationType)
  const managedPresent = has(managed) || mdm || has(remote)
  const reasons = [
    teamLogin && `you sign in with a ${/enterprise/i.test(account.organizationType) ? 'Enterprise' : 'Team'} plan`,
    managedPresent && 'this machine has managed settings',
  ].filter(Boolean)
  const seated = reasons.length > 0

  // The first managed source with a policy key wins (managed-settings.md, "first-wins"): a server
  // policy or an MDM profile hides the files, the drop-in among them, unless one asks to merge.
  const merging = (remote.managedSourcesBehavior ?? managed.managedSourcesBehavior) === 'merge'
  const filesHidden = !merging && (has(remote) || mdm)
  const paths = orgPaths(platform)
  const listed = Array.isArray(managed.appendPlugins) && managed.appendPlugins.includes(ORG_ID)
  const enabled = managed.enabledPlugins?.[ORG_ID] === true
  const source = managed.extraKnownMarketplaces?.[ORG_MARKETPLACE]?.source
  const inPlace = source?.source === 'directory' && source.path === paths.marketplace
  const orgInstalled = listed && enabled && inPlace && !filesHidden
  // Started from --plugin-dir or the marketplace copy, the running mod is the person's; from the
  // system folder it is the organization's.
  const runningOrgCopy = typeof root === 'string' && root.startsWith(paths.marketplace)

  return {
    seated,
    reasons,
    orgInstalled,
    runningOrgCopy,
    filesHidden,
    /** The slide runs: no guard, or this copy is the one the organization runs after it. */
    slideRuns: !seated || runningOrgCopy || (root === undefined && orgInstalled),
  }
}

/** One paragraph for /tokendoctor, the audit and the toast: why the slide is off and the way out. */
export function blockedNote(state) {
  if (state.slideRuns) return null
  const why = state.reasons.join(' and ')
  const fix = state.filesHidden
    ? 'Your organization delivers its own managed settings, which hide any file on this machine: ask an administrator to add tokendoctor as an organization mod (plugins/mods/admin.md).'
    : state.orgInstalled
      ? 'tokendoctor is installed as this machine’s mod: restart Claude Code so that copy loads instead of this one.'
      : 'Run `tokendoctor-org-install` (dry run, then the one sudo command it prints) to install tokendoctor as this machine’s own mod, which runs after the guard. `tokendoctor-org-install --uninstall` undoes it.'
  return (
    `The slide cannot run here: ${why}, so Claude Code seats its built-in guard (cc-plugin-sec-default) ` +
    'ahead of the mods you install, and it sends compaction past them. Claude Code summarizes as usual. ' +
    fix
  )
}
