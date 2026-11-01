import { useRef, useState } from 'react'
import { DAILY, MEANS, SWITCH_DAY } from '@/lib/proof'

const W = 760
const H = 300
const PAD = { top: 26, right: 18, bottom: 34, left: 46 }
const MAX = 600
const TICKS = [0, 200, 400, 600]
const DAY_MS = 86_400_000

const t0 = Date.parse(DAILY[0]!.day)
const t1 = Date.parse(DAILY[DAILY.length - 1]!.day)
const x = (day: string) => PAD.left + ((Date.parse(day) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
const y = (k: number) => PAD.top + (1 - k / MAX) * (H - PAD.top - PAD.bottom)
const BASE = y(0)
const label = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const pt = (p: { day: string; context: number }) => `${x(p.day).toFixed(1)},${y(p.context).toFixed(1)}`

/** Runs of consecutive days: the line is drawn solid within a run and dotted across a gap. */
const RUNS = DAILY.reduce<(typeof DAILY)[]>((runs, p, i) => {
  const gap = i > 0 && Date.parse(p.day) - Date.parse(DAILY[i - 1]!.day) > DAY_MS
  if (i === 0 || gap) runs.push([p])
  else runs[runs.length - 1]!.push(p)
  return runs
}, [])
const GAPS = RUNS.slice(1).map((run, i) => [RUNS[i]![RUNS[i]!.length - 1]!, run[0]!] as const)

const [BEFORE, AFTER] = MEANS
const DROP = Math.round((1 - AFTER!.context / BEFORE!.context) * 100)

/**
 * Mean context per request by day, one series, on a card: an area under the line, the days after the
 * advice shaded, each period's mean dashed, and the drop between them marked where it happened.
 * Hover (or touch) shows a day; the table under it holds every value for a screen reader.
 */
export function ContextChart() {
  const svg = useRef<SVGSVGElement>(null)
  const [at, setAt] = useState<number | null>(null)
  const move = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return
    const px = ((clientX - box.left) / box.width) * W
    let best = 0
    DAILY.forEach((p, i) => {
      if (Math.abs(x(p.day) - px) < Math.abs(x(DAILY[best]!.day) - px)) best = i
    })
    setAt(best)
  }
  const p = at === null ? null : DAILY[at]!
  const sx = x(SWITCH_DAY)
  const bx = sx - 22

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">Context per request, by day</span>
        <span className="chart-sub">thousands of tokens, mean</span>
      </figcaption>
      <div className="chart-plot">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Mean context per request fell from ${BEFORE!.context}K tokens in the month before to ${AFTER!.context}K after 25 October, when the compaction window went to 400K: ${DROP}% less.`}
          onPointerMove={(e) => move(e.clientX)}
          onPointerDown={(e) => move(e.clientX)}
          onPointerLeave={() => setAt(null)}
        >
          <defs>
            <linearGradient id="chart-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--info)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect x={sx} y={PAD.top} width={W - PAD.right - sx} height={BASE - PAD.top} className="chart-after" />
          <text x={sx + 10} y={PAD.top + 14} className="chart-band-label">
            after the advice
          </text>

          {TICKS.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={PAD.left - 10} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {t}K
              </text>
            </g>
          ))}
          {[DAILY[0]!.day, '2026-10-11', DAILY[DAILY.length - 1]!.day].map((d, i) => (
            <text
              key={d}
              x={x(d)}
              y={H - 10}
              className="chart-axis"
              textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            >
              {label(d)}
            </text>
          ))}

          {RUNS.map((run) => (
            <path
              key={run[0]!.day}
              d={`M${x(run[0]!.day)},${BASE}L${run.map(pt).join('L')}L${x(run[run.length - 1]!.day)},${BASE}Z`}
              fill="url(#chart-area)"
            />
          ))}
          {GAPS.map(([a, b]) => (
            <path key={a.day} d={`M${pt(a)}L${pt(b)}`} className="chart-gap" />
          ))}
          {RUNS.map((run) => (
            <path key={run[0]!.day} d={`M${run.map(pt).join('L')}`} className="chart-line" />
          ))}

          {MEANS.map((m) => (
            <line
              key={m.label}
              x1={x(m.from)}
              x2={x(m.to)}
              y1={y(m.context)}
              y2={y(m.context)}
              className="chart-mean"
            />
          ))}
          <text x={x(BEFORE!.at)} y={y(BEFORE!.context) - 9} className="chart-mean-label" textAnchor="middle">
            {BEFORE!.label}
          </text>
          <text x={x(AFTER!.at)} y={y(AFTER!.context) + 20} className="chart-mean-label" textAnchor="end">
            {AFTER!.label}
          </text>

          <g className="chart-drop">
            <line x1={bx} x2={bx} y1={y(BEFORE!.context) + 4} y2={y(AFTER!.context) - 4} />
            <path
              d={`M${bx - 5},${y(AFTER!.context) - 11}L${bx},${y(AFTER!.context) - 3}L${bx + 5},${y(AFTER!.context) - 11}`}
            />
            <text
              x={bx - 10}
              y={(y(BEFORE!.context) + y(AFTER!.context)) / 2}
              textAnchor="end"
              dominantBaseline="middle"
            >
              −{DROP}%
            </text>
          </g>

          {p && (
            <g>
              <line x1={x(p.day)} x2={x(p.day)} y1={PAD.top} y2={BASE} className="chart-cross" />
              <circle cx={x(p.day)} cy={y(p.context)} r={5} className="chart-dot" />
            </g>
          )}
        </svg>
        {p && (
          <div
            className="chart-tip"
            style={{
              left: `${(x(p.day) / W) * 100}%`,
              transform: `translateX(${x(p.day) > W * 0.62 ? '-108%' : '8%'})`,
            }}
          >
            <strong>{p.context}K</strong> per request
            <span>
              {label(p.day)} · {p.requests.toLocaleString('en')} requests
            </span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Every day as a table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Context per request</th>
              <th>Requests</th>
            </tr>
          </thead>
          <tbody>
            {DAILY.map((d) => (
              <tr key={d.day}>
                <td>{label(d.day)}</td>
                <td>{d.context}K</td>
                <td>{d.requests.toLocaleString('en')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
