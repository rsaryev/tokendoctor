// A task: its project copied for a run, the fixed files compared and restored, the tests' score.
// Taken from llx's benchmark (llx/benchmark/lib/task.ts), with tasks that hold bugs to fix.

import * as fs from "node:fs";
import * as path from "node:path";

/** What the agent may not change: the acceptance tests and the project's configuration. */
export const FIXED = ["test", "package.json", "tsconfig.json"];

export function sh(cmd: string[], cwd?: string, timeout?: number) {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", timeout });
  const stdout = p.stdout.toString();
  return { code: p.exitCode, stdout, out: stdout + p.stderr.toString() };
}

/** `bun test` in `dir`: the passes, the failures and what it printed. */
export function score(dir: string): { pass: number; fail: number; output: string } {
  const { out } = sh(["bun", "test"], dir, 300_000);
  const count = (word: string) => Number(out.match(new RegExp(`(\\d+) ${word}`))?.[1] ?? 0);
  return { pass: count("pass"), fail: count("fail"), output: out };
}

/** Every file under `dir` (or `[""]` for a file), relative to it. */
function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  if (!fs.statSync(dir).isDirectory()) return [""];
  return fs.readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => fs.statSync(path.join(dir, name)).isFile());
}

/** The fixed files `work` has changed, added or removed against `project`. */
export function tampered(project: string, work: string): string[] {
  const changed: string[] = [];
  for (const name of FIXED) {
    const a = path.join(project, name), b = path.join(work, name);
    for (const file of new Set([...files(a), ...files(b)])) {
      const [x, y] = [path.join(a, file), path.join(b, file)];
      if (!fs.existsSync(x) || !fs.existsSync(y) || !fs.readFileSync(x).equals(fs.readFileSync(y))) {
        changed.push(path.join(name, file));
      }
    }
  }
  return changed;
}

/** The fixed files put back as the project has them, so an edit through the shell cannot help. */
export function restore(project: string, work: string) {
  for (const name of FIXED) {
    fs.rmSync(path.join(work, name), { recursive: true, force: true });
    fs.cpSync(path.join(project, name), path.join(work, name), { recursive: true });
  }
}

/** A fresh git repository of the project at `work`, as a person's checkout is. */
export function prepare(project: string, work: string) {
  fs.cpSync(project, work, { recursive: true });
  sh(["sh", "-c", "git init -q && git add -A && git -c user.email=b@b -c user.name=b commit -qm start"], work);
}

/** What a task asks: `implement` (stubs) or `fix` (bugs), and the prompt, or the steps of one session. */
/** A step of a session: its prompt, and the colleague's files merged over src/ before it, if any. */
export type Step = string | { prompt: string; merge?: string };

export function spec(taskDir: string): { kind: "implement" | "fix"; prompt?: string; steps?: Step[]; subagents?: boolean } {
  return JSON.parse(fs.readFileSync(path.join(taskDir, "task.json"), "utf8"));
}

/** The task is sound: the reference passes every test; the stubs next to none, or the bugs fail some. */
export function check(taskDir: string): number {
  const ref = path.join(taskDir, "ref"), project = path.join(taskDir, "project");
  const differ = tampered(project, ref);
  if (differ.length) console.log(`the project's and the reference's differ: ${differ.join(", ")}`);
  const r = score(ref), given = score(project), kind = spec(taskDir).kind;
  console.log(`reference: ${r.pass} pass, ${r.fail} fail; the project as given: ${given.pass} pass, ${given.fail} fail`);
  const sound = kind === "implement" ? given.pass < Math.floor(r.pass / 10) : given.fail > 0;
  return !differ.length && r.fail === 0 && sound ? 0 : 1;
}
