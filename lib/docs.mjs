// Claude Code's current documentation, read from the source: code.claude.com serves every page as
// Markdown at /docs/en/<page>.md, with an index for models at /docs/llms.txt. That is fresher than a
// mirror (context7 and the like re-index on their own schedule) and needs no key.
//
// What the audit takes from it, with no model: every documented settings key and environment
// variable, and the release each one needs where the docs say so up front. A key the docs do not
// have is misspelled, removed or never existed, and Claude Code ignores it; a key newer than the
// installed release is ignored too.
//
// Pages are cached for a day in ~/.claude/tokendoctor/docs; offline, the cache is used however old,
// and with no cache the doc checks are skipped. Only public pages are fetched; nothing is sent.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DOCS_BASE = 'https://code.claude.com/docs/en'
export const PAGES = ['settings-reference', 'env-vars']
const DAY = 24 * 3600 * 1000

const VERSION = /Requires Claude Code v(\d+\.\d+\.\d+)/

/** `### \`key\`` headings of settings-reference.md, each with the release its first paragraph names. */
export function parseSettingsKeys(md) {
  const keys = new Map()
  const parts = md.split(/^#{2,4} `([^`]+)`[^\n]*$/m)
  for (let i = 1; i < parts.length; i += 2) {
    // The first paragraph is about the key itself; later ones often date one of its sub-features.
    const first = parts[i + 1].trim().split(/\n\s*\n/)[0] ?? ''
    keys.set(parts[i], VERSION.exec(first)?.[1] ?? null)
  }
  return keys
}

/** Rows of env-vars.md's tables: `| \`NAME\` | what it does |`, with the release a row requires. */
export function parseEnvVars(md) {
  const vars = new Map()
  for (const m of md.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|(.*)$/gm)) vars.set(m[1], VERSION.exec(m[2])?.[1] ?? null)
  return vars
}

/** The parsed docs, or null when there are none to read. */
export function docsIndex(pages) {
  if (!pages['settings-reference'] || !pages['env-vars']) return null
  return { settings: parseSettingsKeys(pages['settings-reference']), env: parseEnvVars(pages['env-vars']) }
}

/**
 * The pages, from the cache when it is less than a day old, else fetched (and cached). `offline`
 * reads the cache only. Resolves `{ pages, fetchedAt, stale }`; pages missing everywhere are absent.
 */
export async function loadDocs(cacheDir, { offline = false, timeoutMs = 8000, now = Date.now(), fetchPage = fetchText } = {}) {
  const pages = {}
  let oldest = now
  let stale = false
  for (const page of PAGES) {
    const file = join(cacheDir, `${page}.md`)
    const cachedAt = existsSync(file) ? statSync(file).mtimeMs : null
    if (cachedAt !== null && (offline || now - cachedAt < DAY)) {
      pages[page] = readFileSync(file, 'utf8')
      oldest = Math.min(oldest, cachedAt)
      stale ||= now - cachedAt >= DAY
      continue
    }
    const text = offline ? null : await fetchPage(`${DOCS_BASE}/${page}.md`, timeoutMs).catch(() => null)
    if (text) {
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(file, text)
      pages[page] = text
    } else if (cachedAt !== null) {
      pages[page] = readFileSync(file, 'utf8')
      oldest = Math.min(oldest, cachedAt)
      stale = true
    }
  }
  return { pages, fetchedAt: new Date(oldest).toISOString(), stale }
}

async function fetchText(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'tokendoctor' } })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const text = await res.text()
  // A page of the docs, not an error page or a redirect to the site's HTML.
  if (!/^#|^> /m.test(text.slice(0, 2000)) || /^<!doctype/i.test(text.trimStart())) throw new Error(`${url}: not Markdown`)
  return text
}
