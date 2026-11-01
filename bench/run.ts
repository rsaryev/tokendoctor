#!/usr/bin/env bun
// The benchmark: Claude Code does a Bun project against acceptance tests written in advance, with
// and without tokendoctor, in a window small enough that it compacts along the way.
//
// Each run copies tasks/<task>/project into a fresh git repository outside this one and starts
// `claude -p` there, kept apart from the person's own settings, plugins and MCP servers; then puts
// back the tests, package.json and tsconfig.json from the pristine copy (so an edit through the
// shell cannot help), runs `bun test`, and records whether the task was solved, the time, the cost,
// the cache, the compactions and every log of the run. The arms' runs are interleaved and run at the
// same time. After llx's benchmark (llx/benchmark). See README.md.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { type Arm, type Options, advise, arm, command, did, environment, token, transcript } from "./lib/claude";
import { type Result, type Run, baselines, history, summary } from "./lib/report";
import { type Step, check, prepare, restore, score, sh, spec, tampered } from "./lib/task";

const HERE = import.meta.dir;
const RESULTS = path.join(HERE, "results");

const gz = (from: string, to: string) => fs.writeFileSync(to, Bun.gzipSync(fs.readFileSync(from)));

async function one(a: Arm, i: number, o: Options, steps: Step[], taskDir: string, project: string, scratch: string, out: string, attempt: number,
  tests: number): Promise<Result> {
  const work = path.join(scratch, `${a.label}-${i}`), logs = path.join(scratch, `${a.label}-${i}.logs`);
  const config = path.join(scratch, `${a.label}-${i}.config`);
  prepare(project, work);
  fs.mkdirSync(logs);
  fs.mkdirSync(config);
  const advice = a.profile === "advised" ? advise(a, config, work) : [];
  const [events, stderr] = [path.join(logs, "events.jsonl"), path.join(logs, "stderr.txt")];
  const env = environment(config);
  const t0 = performance.now();
  // The steps in one session, each resumed from the last: a day of work, one request after another.
  let session: string | null = null, exit: number | null = null, killed: string | null = null;
  const per: { pass: number; wall_s: number }[] = [];
  for (const [n, step] of steps.entries()) {
    const s0 = performance.now();
    const prompt = typeof step === "string" ? step : step.prompt;
    // A colleague's branch merged: their files over the model's own, committed as a merge would be.
    if (typeof step !== "string" && step.merge) {
      fs.cpSync(path.join(taskDir, step.merge), path.join(work, "src"), { recursive: true });
      sh(["sh", "-c", "git add -A && git -c user.email=c@c -c user.name=colleague commit -qm 'Merge branch colleague'"], work);
    }
    const [ev, er] = [`${events}.${n}`, `${stderr}.${n}`];
    const p = Bun.spawn(command(a, o, prompt, session), {
      cwd: work, env, stdin: "ignore", stdout: Bun.file(ev), stderr: Bun.file(er), timeout: o.timeout * 1000,
    });
    exit = await p.exited;
    // Ended by a signal it did not get from its own timeout: something outside the run stopped it.
    if (p.signalCode && performance.now() - s0 < o.timeout * 1000 - 5000) killed = `${p.signalCode} at step ${n + 1}`;
    fs.appendFileSync(events, fs.readFileSync(ev));
    fs.appendFileSync(stderr, fs.readFileSync(er));
    session = did(ev, config).session ?? session;
    if (steps.length > 1) per.push({ pass: score(work).pass, wall_s: Math.round((performance.now() - s0) / 100) / 10 });
    if (exit !== 0 || !session) break;
  }
  const wall_s = Math.round((performance.now() - t0) / 100) / 10;
  const touched = tampered(project, work);
  restore(project, work);
  const t = score(work);
  const d = did(events, config);

  const dir = path.join(out, attempt ? `${a.label}-${i}.attempt-${attempt}` : `${a.label}-${i}`);
  fs.mkdirSync(dir, { recursive: true });
  gz(events, path.join(dir, "events.jsonl.gz"));
  if (fs.existsSync(stderr) && fs.statSync(stderr).size) gz(stderr, path.join(dir, "stderr.txt.gz"));
  const kept = d.session ? transcript(d.session, config) : null;
  if (kept) gz(kept, path.join(dir, "transcript.jsonl.gz"));
  if (advice.length) fs.writeFileSync(path.join(dir, "settings.json"), fs.readFileSync(path.join(config, "settings.json")));
  fs.writeFileSync(path.join(dir, "test.txt.gz"), Bun.gzipSync(Buffer.from(t.output)));
  sh(["tar", "czf", path.join(dir, "src.tar.gz"), "-C", work, "src"]);
  fs.writeFileSync(path.join(dir, "answer.md"), d.answer.trim() + "\n");

  const { answer: _, session: __, ...rest } = d;
  const input = d.input_tokens + d.cache_read + d.cache_write;
  return {
    ...rest, label: a.label, run: i, exit, killed, wall_s, pass: t.pass, fail: t.fail, solved: t.pass === tests,
    tampered: touched, cost_usd: Math.round(d.cost_usd * 1e4) / 1e4, cache_pct: input ? Math.round((100 * d.cache_read) / input) : 0,
    advice, steps: per,
  };
}

const stamp = (d: Date, sep: string, mid: string) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${mid}${p(d.getHours())}${sep}${p(d.getMinutes())}`;
};

const writeHistory = () => fs.writeFileSync(path.join(HERE, "HISTORY.md"), history(RESULTS));

/** What goes into git names no one: the home folder becomes ~, a temporary folder $TMPDIR. */
function scrub(text: string) {
  const home = os.homedir(), tmp = fs.realpathSync(os.tmpdir());
  return text.split(tmp).join("$TMPDIR").split(os.tmpdir()).join("$TMPDIR").split(home).join("~")
    .replace(/\/(?:private\/)?var\/folders\/[^"\s]+?\/T\//g, "$TMPDIR/");
}

/** Every run.json scrubbed again: for runs written before scrub was. */
function scrubAll() {
  for (const d of fs.readdirSync(RESULTS)) {
    const f = path.join(RESULTS, d, "run.json");
    if (fs.existsSync(f)) fs.writeFileSync(f, scrub(fs.readFileSync(f, "utf8")));
    const m = path.join(RESULTS, d, "summary.md");
    if (fs.existsSync(m)) fs.writeFileSync(m, scrub(fs.readFileSync(m, "utf8")));
  }
}

async function main(): Promise<number> {
  const tasks = fs.readdirSync(path.join(HERE, "tasks")).filter((t) => fs.existsSync(path.join(HERE, "tasks", t, "task.json"))).sort();
  const { values: v } = parseArgs({
    options: {
      task: { type: "string", default: "fixkit" },
      arm: { type: "string", multiple: true },
      repeat: { type: "string", default: "1" },
      model: { type: "string", default: "claude-haiku-5-5" },
      window: { type: "string" },
      effort: { type: "string" },
      timeout: { type: "string", default: "1800" },
      parallel: { type: "string", default: "2" },
      note: { type: "string", default: "" },
      check: { type: "boolean", default: false },
      history: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (v.help) {
    console.log(`usage: bun bench/run.ts [options]  (see bench/README.md)
  --task ${tasks.join("|")}     the task (default fixkit)
  --arm [label=]profile[+slide[:pct]][@folder]  factory (Claude Code as it ships) or advised (with
                               every fix tokendoctor's audit offers), +slide (to pct%, default 25);
                               tokendoctor from this repository or a folder; repeat to compare
                               (default: advised+slide, or factory+slide with --window; compared
                               with the fixed baselines in baselines.json)
  --repeat N                   runs an arm (default 1)
  --model ID                   default claude-haiku-5-5
  --window N                   autoCompactWindow for every arm, over the profile's own (100000 is
                               the least Claude Code takes)
  --effort LEVEL, --timeout S a step (1800), --parallel N (2), --note TEXT
  --check                      only check the task: the reference passes, the project as given does not
  --history                    only make HISTORY.md again from results/`);
    return 0;
  }
  if (v.history) return (scrubAll(), writeHistory(), 0);
  if (!tasks.includes(v.task!)) throw new Error(`--task: one of ${tasks.join(", ")}`);
  const taskDir = path.join(HERE, "tasks", v.task!);
  if (v.check) return check(taskDir);
  const task = spec(taskDir);
  const o: Options = {
    model: v.model!, window: v.window ? Number(v.window) : null, timeout: Number(v.timeout), effort: v.effort ?? null,
    subagents: Boolean(task.subagents),
  };
  token(); // signed in before anything starts
  const steps = task.steps ?? [task.prompt!];
  // tokendoctor's arm alone, measured against the fixed baselines (baselines.json); a baseline is
  // run again only when asked (--arm factory, --arm advised).
  const arms = (v.arm ?? [o.window ? "factory+slide" : "advised+slide"]).map(arm);
  if (new Set(arms.map((a) => a.label)).size < arms.length) throw new Error("--arm: two arms with one label");
  const repeat = Number(v.repeat), parallel = Number(v.parallel);
  const project = path.join(taskDir, "project");
  const tests = score(path.join(taskDir, "ref")).pass; // the reference passes every test
  const now = new Date();
  const out = path.join(RESULTS, `${stamp(now, "", "_")}-${v.task}`);
  fs.mkdirSync(out, { recursive: true });
  const macos = os.type() === "Darwin" ? sh(["sw_vers", "-productVersion"]).stdout.trim() : os.release();
  const run: Run = {
    when: stamp(now, ":", " "), task: v.task!, tests, steps: steps.length, model: o.model, window: o.window, effort: o.effort,
    timeout_s: o.timeout, repeat, note: v.note!, machine: `${os.type()} ${os.arch()} ${macos}`,
    claude: sh(["claude", "--version"]).stdout.trim(), load: Math.round(os.loadavg()[0]! * 10) / 10, arms, runs: [],
  };
  console.log(`${run.when} ${run.task} (${tests} tests, ${steps.length} steps), ${o.model}, window ${o.window ?? "the profile's"}: ${arms.map((a) => a.label).join(", ")}; ${out}`);
  // run.json after every run: a runner that dies keeps what it finished.
  const save = () => fs.writeFileSync(path.join(out, "run.json"), scrub(JSON.stringify({ ...run, runs: run.runs.filter(Boolean) }, null, 1)) + "\n");
  const jobs = Array.from({ length: repeat }, (_, i) => arms.map((a) => [a, i] as const)).flat();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tokendoctor-bench-"));
  try {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const at = next++;
        const [a, i] = jobs[at]!;
        // A run stopped from outside says nothing of the arm: run it again, up to twice.
        // Each attempt kept: a stopped one in <arm>-<n>.attempt-<k>, run.json lists it under `stopped`.
        for (let tries = 0; tries < 3; tries++) {
          const r = await one(a, i, o, steps, taskDir, project, scratch, out, tries, tests);
          if (r.killed) { (run.stopped ??= []).push(r); save(); }
          run.runs[at] = r;
          if (!r.killed) break;
          console.log(`${a.label}-${i}: stopped from outside (${run.runs[at]!.killed}), run again`);
        }
        const r = run.runs[at]!;
        save();
        console.log(`${a.label}-${i}: ${r.pass}/${tests}, $${r.cost_usd}, ${r.wall_s}s, ${r.requests} requests, ` +
          `${r.summaries} summaries, ${r.slides} slides, ${r.rereads} re-reads, max ${Math.round(r.max_context / 1000)}K, ${r.status}` +
          (r.advice.length ? `, advice: ${r.advice.join(" ")}` : ""));
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, worker));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(out, "run.json"), scrub(JSON.stringify(run, null, 1)) + "\n");
  fs.writeFileSync(path.join(out, "summary.md"), scrub(summary(run, baselines(HERE, run))));
  writeHistory();
  console.log("\n" + summary(run, baselines(HERE, run)));
  return 0;
}

process.exit(await main());
