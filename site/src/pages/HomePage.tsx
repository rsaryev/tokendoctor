import { DemoFilm } from '@/components/home/DemoFilm'
import { InstallCommand } from '@/components/home/InstallCommand'
import { HOME_SHELL } from '@/lib/shell'
import { DOCS_URL, INSTALL } from '@/lib/site'
import '../components/home/films.css'

const HEADLINE = 'Stop wasting tokens'
/** The word set on a white chip, as a highlight. */
const CHIP_WORD = 'wasting'

/**
 * One screen: the copy on the left (a heavy headline with one word on a chip, the
 * sentence, the install and a mono line under it), and the demo on the right, where the plugin
 * replays an audit. Everything else lives in the README.
 */
export function HomePage() {
  const words = HEADLINE.split(' ')
  return (
    <section id="intro" className={`${HOME_SHELL} hero`} aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title" className="hero-title">
          {words.map((word, index) => (
            <span key={word}>
              {word === CHIP_WORD ? <span className="hero-chip">{word}</span> : word}
              {index < words.length - 1 ? ' ' : null}
            </span>
          ))}
        </h1>
        <p className="hero-lede">
          See where your Claude Code tokens actually go, fix the settings that waste them, and watch
          the trend. It reads your local session logs, audits your setup against the docs, and changes
          a setting only after you approve the exact diff.
        </p>
        <InstallCommand commands={INSTALL} />
        <p className="hero-under">
          Claude Code plugin · 31 checks · a status line that warns before limits run out · runs locally · <a href={DOCS_URL}>Read the docs</a>
        </p>
      </div>
      <div id="demo" className="hero-demo">
        <DemoFilm />
        <p className="demo-caption">
          <span>
            <code>/tokendoctor:sessions</code> and <code>/tokendoctor:audit</code> on a real setup
          </span>
          <span>Recorded live with asciinema</span>
        </p>
      </div>
    </section>
  )
}
