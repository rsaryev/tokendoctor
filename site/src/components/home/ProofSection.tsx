import { HOME_SHELL } from '@/lib/shell'
import { INSTALL } from '@/lib/site'
import { FIGURES, SLIDE } from '@/lib/proof'
import { ContextChart } from './ContextChart'
import { InstallCommand } from './InstallCommand'

const CAVEATS = [
  'Rarely past 400K tokens? The window won’t help.',
  'A summary just before you finish can cost more.',
  'Models, effort and the work itself move the number.',
]

/**
 * After the steps: what tokendoctor did on real use (the chart and its figures, then the slide
 * against a summary), and the honest part, that there is no one pill, which ends on the install:
 * it shows a person their own number before it changes anything.
 */
export function ProofSection() {
  return (
    <>
      <section className={`${HOME_SHELL} proof`} aria-labelledby="proof-title">
        <header className="proof-head">
          <h2 id="proof-title" className="proof-title">
            Six weeks of real use
          </h2>
          <p className="proof-lede">One developer’s transcripts. On 25 October: a 400K window, Sonnet for subagents.</p>
        </header>
        <div className="proof-grid">
          <ContextChart />
          <ul className="figures">
            {FIGURES.map((f) => (
              <li key={f.label} className="figure">
                <span className="figure-value">{f.value}</span>
                <span className="figure-label">{f.label}</span>
                <span className="figure-detail">{f.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <h3 className="proof-subtitle">Slide vs. summary</h3>
        <ul className="figures figures-row">
          {SLIDE.map((f) => (
            <li key={f.label} className="figure">
              <span className="figure-value">{f.value}</span>
              <span className="figure-label">{f.label}</span>
              <span className="figure-detail">{f.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${HOME_SHELL} proof proof-yours`} aria-labelledby="yours-title">
        <div>
          <h2 id="yours-title" className="proof-title">
            No one pill
          </h2>
          <ul className="caveats">
            {CAVEATS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="yours-box">
          <p className="yours-text">See your own number first.</p>
          <InstallCommand commands={INSTALL} />

          <p className="yours-cmd">
            <span className="yours-prompt">&gt;</span>/tokendoctor:sessions
          </p>
        </div>
      </section>
    </>
  )
}
