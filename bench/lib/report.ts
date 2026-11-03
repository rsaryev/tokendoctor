// A run's summary.md, and HISTORY.md made again from every run's run.json. After llx's benchmark.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Arm, Did } from "./claude";

/** One arm's run of the task, as run.json keeps it. */
export type Result = Omit<Did, "answer" | "session"> & {
  label: string; run: number; exit: number | null; wall_s: number;
  pass: number; fail: number; solved: boolean; tampered: string[]; cache_pct: number; killed?: string | null;
  /** The audit's findings fixed before the run (the advised profile), and each step's tests passed. */
  advice: string[]; steps: { pass: number; wall_s: number }[];
};

/** A run of run.ts: what was run, where, and each arm's results. */
export type Run = {
  when: string; task: string; tests: number; steps?: number; model: string; window: number | null; effort: string | null;
  timeout_s: number; repeat: number; note: string; machine: string; claude: string; load: number;
  arms: Arm[]; runs: Result[];
  /** Attempts stopped from outside and run again; each kept in <arm>-<n>.attempt-<k>. */
  stopped?: Result[];
};

const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(" | ")} |`, `|${"---|".repeat(head.length)}`, ...rows.map((r) => `| ${r.join(" | ")} |`)];
const k = (tokens: number) => `${Math.round(tokens / 1000)}K`;

/** The median, a whole number where it is one. */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b), mid = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
  return Math.round(m * 1e4) / 1e4;
}

const profile = (a: Arm) => a.profile ?? "factory";
const slides = (a: Arm) => a.slide ?? a.mode === "slide";
const armName = (a: Arm) =>
  [profile(a) === "advised" ? `every fix tokendoctor's audit offers applied` : "Claude Code as it ships, empty config",
    slides(a) ? `the slide down to ${a.slideTo}%` : null, a.reads ? "Bash prints of files sent to Read" : null, a.version ? `tokendoctor ${a.version}` : null].filter(Boolean).join("; ");
const shownWindow = (w: number | null) => (w ? k(w) : "each profile's own");

type Baseline = { task: string; model: string; window: number | null; run: string; arms: string[] };

/** The fixed reference runs (baselines.json) this run's task, model and window are measured against. */
export function baselines(bench: string, run: Pick<Run, "task" | "model" | "window">): { label: string; run: string; results: Result[] }[] {
  const file = path.join(bench, "baselines.json");
  if (!fs.existsSync(file)) return [];
  const all: Baseline[] = JSON.parse(fs.readFileSync(file, "utf8")).baselines;
  return all
    .filter((b) => b.task === run.task && b.model === run.model && (b.window ?? null) === (run.window ?? null))
    .flatMap((b) => {
      const ref: Run = JSON.parse(fs.readFileSync(path.join(bench, "results", b.run, "run.json"), "utf8"));
      return b.arms.map((label) => ({ label, run: b.run, results: ref.runs.filter((r) => r.label === label && !r.killed) }));
    });
}

const pct = (x: number, base: number) => `${x >= base ? "+" : "−"}${Math.abs(Math.round((x / base - 1) * 100))}%`;

/** Each arm's medians against each baseline's: cost and time, and the change. */
function against(run: Run, refs: ReturnType<typeof baselines>): string[] {
  if (!refs.length) return [];
  const rows: (string | number)[][] = refs.map((b) => [
    `${b.label} (baseline, [${b.run}](../${b.run}/summary.md))`, b.results.length,
    `$${median(b.results.map((r) => r.cost_usd)).toFixed(4)}`, `${median(b.results.map((r) => r.wall_s))} s`, "", "",
  ]);
  for (const a of run.arms) {
    const rs = run.runs.filter((r) => r.label === a.label && !r.killed);
    if (!rs.length) continue;
    const cost = median(rs.map((r) => r.cost_usd)), wall = median(rs.map((r) => r.wall_s));
    rows.push([a.label, rs.length, `$${cost.toFixed(4)}`, `${wall} s`,
      refs.map((b) => `${pct(cost, median(b.results.map((r) => r.cost_usd)))} vs ${b.label}`).join(", "),
      refs.map((b) => `${pct(wall, median(b.results.map((r) => r.wall_s)))} vs ${b.label}`).join(", ")]);
  }
  return ["", "Against the baselines (medians):", "", ...table(["arm", "runs", "cost", "time", "cost change", "time change"], rows)];
}

export function summary(run: Run, refs: ReturnType<typeof baselines> = []): string {
  const lines = [`# ${run.task}, ${run.when}`, ""];
  if (run.note) lines.push(run.note, "");
  lines.push(
    `${run.tests} tests${run.steps && run.steps > 1 ? ` in ${run.steps} steps of one session` : ""}; ${run.model}${run.effort ? `, effort ${run.effort}` : ""}; window ${shownWindow(run.window)}; ` +
      `${run.timeout_s} s a run; runs an arm: ${run.repeat}; ${run.claude}; ${run.machine}, load ${run.load}.`,
    "",
    ...table(["arm", "what"], run.arms.map((a) => [a.label, armName(a)])),
    "",
    ...table(
      ["arm", "run", "solved", "pass", "wall s", "cost $", "requests", "cache %", "max context", "compactions",
        "summaries", "slides", "compact s", "reads", "re-reads", "edits", "failed tools", "tampered", "status"],
      run.runs.map((r) => [
        r.label, r.run, r.solved ? "yes" : "no", `${r.pass}/${run.tests}`, r.wall_s, r.cost_usd.toFixed(4), r.requests,
        r.cache_pct, k(r.max_context), r.compactions, r.summaries, r.slides, r.compact_s, r.reads, r.rereads, r.edits,
        r.failed_tools, r.tampered.length, r.status ?? "—",
      ]),
    ),
    ...against(run, refs),
    ...(run.runs.some((r) => r.advice?.length) ? ["", "Advice applied: " + [...new Set(run.runs.flatMap((r) => r.advice ?? []))].join(", ") + "."] : []),
    ...(run.runs.some((r) => r.steps?.length)
      ? ["", ...table(["arm", "run", ...(run.runs[0]!.steps ?? []).map((_, n) => `step ${n + 1}`)],
        run.runs.map((r) => [r.label, r.run, ...(r.steps ?? []).map((s) => `${s.pass} (${s.wall_s} s)`)]))]
      : []),
    "",
    "Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` " +
      "(the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), " +
      "`src.tar.gz` (the code) and `answer.md` (its last words).",
  );
  return lines.join("\n") + "\n";
}

/** HISTORY.md: a row per arm per run of run.ts, its medians over the runs. */
export function history(results: string): string {
  const rows: (string | number)[][] = [];
  for (const name of fs.readdirSync(results).sort()) {
    const file = path.join(results, name, "run.json");
    if (!fs.existsSync(file)) continue;
    const run: Run = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const a of run.arms) {
      const rs = run.runs.filter((r) => r.label === a.label && !r.killed);
      if (!rs.length) continue;
      const med = (key: (r: Result) => number) => median(rs.map(key));
      rows.push([
        `[${run.when}](results/${name}/summary.md)`, run.task, run.model.replace(/^claude-/, ""), shownWindow(run.window), a.label,
        a.version ? `${a.version}${slides(a) ? `, slide ${a.slideTo}%` : ""}${a.reads ? ", reads" : ""}` : "—", rs.length, `${rs.filter((r) => r.solved).length}/${rs.length}`,
        `${med((r) => r.pass)}, ${Math.min(...rs.map((r) => r.pass))} of ${run.tests}`, med((r) => r.wall_s),
        med((r) => r.cost_usd).toFixed(4), med((r) => r.requests), med((r) => r.cache_pct),
        `${med((r) => r.summaries)} / ${med((r) => r.slides)}`, med((r) => r.compact_s), med((r) => r.rereads),
      ]);
    }
  }
  return [
    "# Benchmark history", "",
    "A row per arm per run of `run.ts`, its medians over the runs: whether the task was solved (every " +
      "test passed), the time, the cost Claude Code reports, the model requests, the share of input " +
      "read from the prompt cache, the compactions (summaries / slides) and the seconds they took, and " +
      "the files read again. Made again from `results/*/run.json` by each run (`bun bench/run.ts --history`).", "",
    ...table(["when", "task", "model", "window", "arm", "tokendoctor", "runs", "solved", "pass (median, min)", "wall s",
      "cost $", "requests", "cache %", "summaries / slides", "compact s", "re-reads"], rows),
  ].join("\n") + "\n";
}
