// The arms a run compares, each in a Claude Code of its own: a fresh, empty config folder
// (CLAUDE_CONFIG_DIR), signed in with the token in the repository's .env, so neither the person's
// settings, CLAUDE.md, memory, plugins nor sessions take part, and nothing of theirs is touched.
//
// - factory: that empty Claude Code, as it ships.
// - advised: the same, after tokendoctor's audit was run on it and every fix it offers applied with
//   tokendoctor-apply: what a person gets who takes all of its advice.
// - +slide: tokendoctor loaded (--plugin-dir) with its slide on.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { sh } from "./task";

const REPO = path.join(import.meta.dir, "../..");

/** One arm: its label, its profile, whether the slide is on and how far, and the plugin it uses. */
export type Arm = {
  label: string; profile: "factory" | "advised"; slide: boolean; slideTo: number | null;
  plugin: string | null; version: string | null;
  /** run.json from before the profiles: `stock` was factory, `slide` factory+slide. */
  mode?: "stock" | "slide";
};

/** What every arm of a run shares; `window` set overrides every arm's own (the profile's) window. */
export type Options = { model: string; window: number | null; timeout: number; effort: string | null; subagents: boolean };

/**
 * The arm `spec` names: `[label=]profile[+slide[:percent]][@plugin folder]`: `factory`, `advised`,
 * `advised+slide`, `factory+slide:40`, `new=advised+slide@/tmp/tokendoctor`. The plugin, for the
 * advice and the slide, is this repository unless a folder is named. `stock` and `slide` stand for
 * `factory` and `factory+slide`.
 */
export function arm(spec: string): Arm {
  const eq = spec.indexOf("="), rest = eq < 0 ? spec : spec.slice(eq + 1);
  const [head, folder] = rest.split("@") as [string, string | undefined];
  const named = head.replace(/^stock$/, "factory").replace(/^slide/, "factory+slide");
  const m = /^(factory|advised)(\+slide(?::(\d+))?)?$/.exec(named);
  if (!m) throw new Error(`--arm ${spec}: factory or advised, with +slide or +slide:<percent>`);
  const label = eq < 0 ? head : spec.slice(0, eq);
  const profile = m[1] as Arm["profile"], slide = Boolean(m[2]);
  const uses = slide || profile === "advised";
  const plugin = uses ? path.resolve(folder ?? REPO) : null;
  if (plugin && !fs.existsSync(path.join(plugin, ".claude-plugin", "plugin.json"))) throw new Error(`--arm ${spec}: no plugin at ${plugin}`);
  return { label, profile, slide, slideTo: slide ? Number(m[3] ?? 25) : null, plugin, version: plugin ? version(plugin) : null };
}

/** The plugin's version, its commit where it is a git checkout (-dirty with changes to its code). */
function version(plugin: string): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8")).version;
  const git = (...a: string[]) => sh(["git", "-C", plugin, ...a]);
  const head = git("rev-parse", "--short", "HEAD");
  if (head.code !== 0) {
    const hooks = fs.readFileSync(path.join(plugin, "hooks", "window.ts"));
    return `${manifest} ${createHash("sha256").update(hooks).digest("hex").slice(0, 8)}`;
  }
  const dirty = git("status", "--porcelain", "--", "hooks", "lib", "bin", ".claude-plugin").stdout.trim() ? "-dirty" : "";
  return `${manifest} ${head.stdout.trim()}${dirty}`;
}

/** The token from the repository's .env (CLAUDE_CODE_OAUTH_TOKEN, from `claude setup-token`). */
export function token(): string {
  const env = path.join(REPO, ".env");
  const line = fs.existsSync(env) ? fs.readFileSync(env, "utf8").split("\n").find((l) => l.startsWith("CLAUDE_CODE_OAUTH_TOKEN=")) : undefined;
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!value) throw new Error("no CLAUDE_CODE_OAUTH_TOKEN in .env: run `claude setup-token` and put it there");
  return value;
}

/** The environment a run's Claude Code (and tokendoctor's commands for it) see: the config folder its own. */
export function environment(config: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("CLAUDE") && !k.startsWith("ANTHROPIC")) env[k] = v;
  return { ...env, CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_OAUTH_TOKEN: token() };
}

/**
 * The advised profile: tokendoctor's audit on this Claude Code and the task, and each fix it offers
 * applied with tokendoctor-apply. Returns the findings fixed.
 */
export function advise(a: Arm, config: string, work: string): string[] {
  const env = { ...environment(config), HOME: path.dirname(config) };
  const run = (bin: string, args: string[]) =>
    Bun.spawnSync(["node", path.join(a.plugin!, "bin", bin), ...args], { cwd: work, env, stdout: "pipe", stderr: "pipe" });
  const audit = JSON.parse(run("tokendoctor-audit", ["--json", "--project", work]).stdout.toString());
  const fixed: string[] = [];
  for (const f of audit.findings as { id: string; fixes?: unknown }[]) {
    if (!f.fixes) continue;
    const r = run("tokendoctor-apply", [f.id, "--write", "--project", work]);
    if (r.exitCode === 0 && /written/.test(r.stdout.toString())) fixed.push(f.id);
  }
  return fixed;
}

/**
 * How `a` is started on a step of the task, in its own config folder (the environment above). Every
 * effect is allowed but an edit of the fixed files, which are put back after the run anyway.
 */
export function command(a: Arm, o: Options, prompt: string, resume: string | null): string[] {
  const options = { slide: a.slide, slideTo: a.slideTo ?? 25 };
  const settings = {
    ...(o.window ? { autoCompactWindow: o.window } : {}),
    // A plugin loaded from a folder keeps its options under its own name.
    pluginConfigs: { tokendoctor: { options }, "tokendoctor@inline": { options } },
  };
  const fixed = ["test/**", "package.json", "tsconfig.json"].flatMap((f) => [`Edit(${f})`, `Write(${f})`]);
  // No subagents unless the task wants them: the work stays in one context, where compaction
  // happens. With them the model gives each module to a subagent, no context fills, and which kind
  // it picks (one that runs on another model) decides the cost more than anything measured here.
  const solo = o.subagents ? [] : ["Agent", "Task"];
  return [
    "claude", "-p", prompt, "--model", o.model, "--output-format", "stream-json", "--verbose",
    "--permission-mode", "bypassPermissions", "--strict-mcp-config",
    "--settings", JSON.stringify(settings), "--disallowedTools", ...fixed, ...solo,
    ...(o.effort ? ["--effort", o.effort] : []),
    ...(a.slide && a.plugin ? ["--plugin-dir", a.plugin] : []),
    ...(resume ? ["--resume", resume] : []),
  ];
}

/** The transcript Claude Code kept for a session in a config folder. */
export function transcript(sessionId: string, config: string): string | null {
  const root = path.join(config, "projects");
  if (!fs.existsSync(root)) return null;
  for (const d of fs.readdirSync(root)) {
    const f = path.join(root, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** What a run did, from the stream's last event and the transcript. */
export type Did = {
  status: string | null; answer: string; cost_usd: number; session: string | null;
  requests: number; input_tokens: number; cache_read: number; cache_write: number; output_tokens: number;
  max_context: number; avg_context: number;
  compactions: number; summaries: number; slides: number; compact_s: number;
  reads: number; rereads: number; edits: number; bash: number; failed_tools: number;
};

const rows = (file: string | null): any[] =>
  file && fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("{")).flatMap((l) => {
      try { return [JSON.parse(l)]; } catch { return []; }
    })
    : [];

export function did(events: string, config: string): Did {
  const results = rows(events).filter((e) => e.type === "result");
  const result = results.at(-1) ?? {};
  const session: string | null = result.session_id ?? rows(events).find((e) => e.session_id)?.session_id ?? null;
  const t = rows(session ? transcript(session, config) : null);
  const d: Did = {
    // A step that did not end in success names the run's status; a resumed run's cost counts the
    // session from its start, so the last is the whole.
    status: results.find((r) => r.subtype !== "success")?.subtype ?? result.subtype ?? null, answer: String(result.result ?? ""), cost_usd: result.total_cost_usd ?? 0, session,
    requests: 0, input_tokens: 0, cache_read: 0, cache_write: 0, output_tokens: 0, max_context: 0, avg_context: 0,
    compactions: 0, summaries: 0, slides: 0, compact_s: 0, reads: 0, rereads: 0, edits: 0, bash: 0, failed_tools: 0,
  };
  const seen = new Set<string>(), uses = new Set<string>(), read = new Set<string>();
  let context = 0;
  for (const r of t) {
    if (r.subtype === "compact_boundary") {
      d.compactions++;
      d.compact_s += (r.compactMetadata?.durationMs ?? 0) / 1000;
    }
    if (r.isCompactSummary) d.summaries++;
    if (r.type === "user" && Array.isArray(r.message?.content)) {
      for (const b of r.message.content) if (b.type === "tool_result" && b.is_error) d.failed_tools++;
    }
    if (r.type !== "assistant" || r.isCompactSummary) continue;
    const m = r.message, u = m.usage ?? {};
    const size = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    if (m.id && size && !seen.has(m.id)) {
      seen.add(m.id);
      d.requests++;
      d.input_tokens += u.input_tokens ?? 0;
      d.cache_read += u.cache_read_input_tokens ?? 0;
      d.cache_write += u.cache_creation_input_tokens ?? 0;
      d.output_tokens += u.output_tokens ?? 0;
      d.max_context = Math.max(d.max_context, size);
      context += size;
    }
    for (const b of m.content ?? []) {
      if (b.type !== "tool_use" || uses.has(b.id)) continue;
      uses.add(b.id);
      if (b.name === "Read") {
        const file = String(b.input?.file_path ?? "");
        d.reads++;
        if (read.has(file)) d.rereads++;
        read.add(file);
      }
      if (["Edit", "MultiEdit", "Write"].includes(b.name)) d.edits++;
      if (b.name === "Bash") d.bash++;
    }
  }
  // A slide writes the conversation back with no summary; a summary leaves a summary row.
  d.slides = Math.max(0, d.compactions - d.summaries);
  d.compact_s = Math.round(d.compact_s * 10) / 10;
  d.avg_context = d.requests ? Math.round(context / d.requests) : 0;
  return d;
}
