import type { ReactNode } from 'react'
import { HOME_SHELL } from '../lib/shell'
import { REPOSITORY_URL, DOCS_URL } from '../lib/site'
import { SiteHeader } from './SiteHeader'

const FOOTER_LINKS = [
  { label: 'Docs', href: DOCS_URL },
  { label: 'GitHub', href: REPOSITORY_URL },
  { label: 'Changelog', href: `${REPOSITORY_URL}/blob/main/CHANGELOG.md` },
]

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
      <SiteHeader />
      <main id="main-content" className="flex-1 outline-none">
        {children}
      </main>
      <footer className="site-footer">
        <div
          className={`${HOME_SHELL} flex flex-wrap items-center justify-between gap-4 pt-7 pb-10 text-[0.8125rem] text-text-faint`}
        >
          <p className="m-0">
            <span className="text-text-soft">tokendoctor</span> is MIT-licensed and open source.
          </p>
          <nav aria-label="Footer" className="site-footer-nav flex items-center gap-5">
            {FOOTER_LINKS.map(({ label, href }) => (
              <a key={label} href={href} className="hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
