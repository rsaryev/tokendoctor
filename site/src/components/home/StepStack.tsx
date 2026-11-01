import { type CSSProperties, useEffect, useRef } from 'react'
import { HOME_SHELL } from '@/lib/shell'
import { STEPS } from '@/lib/steps'

/**
 * The four steps one after another, as llx's landing does it: each card held under the header while
 * the next slides over it, a little lower, so the edges of those under it show. Words on the left,
 * what tokendoctor printed on the right; a panel's lines come in once the card is seen. Without
 * script everything simply stands.
 */
export function StepStack() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const cards = [...(root.current?.querySelectorAll<HTMLElement>('.step-card') ?? [])]
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-reveal', 'seen')
          seen.unobserve(entry.target)
        }
      },
      { threshold: 0.35 },
    )
    for (const card of cards) {
      if (card.getBoundingClientRect().top > window.innerHeight) card.setAttribute('data-reveal', 'wait')
      seen.observe(card)
    }
    return () => seen.disconnect()
  }, [])

  return (
    <section ref={root} className={`${HOME_SHELL} steps`} aria-labelledby="steps-title">
      <h2 id="steps-title" className="steps-title">
        How it works
      </h2>
      <div className="steps-stack">
        {STEPS.map((step, index) => (
          <article key={step.title} className="step-card" style={{ '--n': index } as CSSProperties}>
            <div className="step-text">
              <p className="step-kicker">{step.kicker}</p>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <code className="step-command">{step.command}</code>
            </div>
            <pre className="step-panel" aria-label={`${step.title}: what tokendoctor printed`}>
              {step.panel.map((line, i) => (
                <span key={i} className="step-row" style={{ '--i': i } as CSSProperties}>
                  {line.map(([tone, text], part) => (
                    <span key={part} className={tone ? `t-${tone}` : undefined}>
                      {text}
                    </span>
                  ))}
                  {line.length === 1 && !line[0]![1] ? ' ' : null}
                </span>
              ))}
            </pre>
          </article>
        ))}
      </div>
    </section>
  )
}
