import { DemoFilm } from '@/components/home/DemoFilm'
import { ProofSection } from '@/components/home/ProofSection'
import { StepStack } from '@/components/home/StepStack'
import { InstallCommand } from '@/components/home/InstallCommand'
import { HOME_SHELL } from '@/lib/shell'
import { INSTALL } from '@/lib/site'
import '../components/home/films.css'

const HEADLINE = 'The same Claude Code for up to 40% less'
/** The word set on a white chip, as a highlight. */
const CHIP_WORD = '40%'

/**
 * The hero, one screen: the copy on the left (a heavy headline with one word on a chip, the
 * sentence, the install and a mono line under it), and the demo on the right, where the plugin
 * replays an audit. Everything else lives in the README.
 */
export function HomePage() {
  const words = HEADLINE.split(' ')
  return (
    <>
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
            See what your Claude Code use overpays, fix it, undo it any time. Runs on your machine.
          </p>
          <InstallCommand commands={INSTALL} />
          <p className="hero-under">
            Your saving depends on how you work · <a href="#proof-title">See the proof</a>
          </p>
        </div>
        <div id="demo" className="hero-demo">
          <DemoFilm />
          <p className="demo-caption">
            <span>A real session, recorded live</span>
          </p>
        </div>
      </section>
      <StepStack />
      <ProofSection />
    </>
  )
}
