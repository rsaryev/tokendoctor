import { HOME_SHELL } from '../lib/shell'
import { DOCS_URL, REPOSITORY_URL } from '../lib/site'
import { GitHubMark } from './GitHubMark'

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className={`${HOME_SHELL} flex h-16 items-center justify-between gap-4`}>
        <a href="/" className="site-mark focus-ring" aria-label="tokendoctor home">
          <img src="/logo.svg" alt="" width={32} height={32} />
        </a>
        <nav aria-label="Site navigation" className="flex items-center gap-2 text-sm md:gap-5">
          <a href={DOCS_URL} className="site-header-link focus-ring text-text-soft hover:text-foreground">
            Docs
          </a>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="tokendoctor on GitHub"
            className="site-header-link focus-ring text-text-soft hover:text-foreground"
          >
            <GitHubMark className="size-4" />
          </a>
        </nav>
      </div>
    </header>
  )
}
