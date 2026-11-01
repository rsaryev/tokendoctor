// Line diffs, unified diffs and patches. See README.md, "diff".

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

export type Edit = { op: "keep" | "delete" | "insert"; line: string };

export interface UnifiedOptions {
  context?: number;
  fromFile?: string;
  toFile?: string;
}

type Op = "keep" | "delete" | "insert";

function script(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  // dist[i * w + j]: fewest deletes + inserts turning a[i..] into b[j..].
  const dist = new Int32Array((n + 1) * w);
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      if (i === n) dist[i * w + j] = m - j;
      else if (j === m) dist[i * w + j] = n - i;
      else if (a[i] === b[j]) dist[i * w + j] = dist[(i + 1) * w + j + 1]!;
      else dist[i * w + j] = 1 + Math.min(dist[(i + 1) * w + j]!, dist[i * w + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const d = dist[i * w + j]!;
    if (i < n && j < m && a[i] === b[j] && dist[(i + 1) * w + j + 1] === d) {
      ops.push("keep");
      i++;
      j++;
    } else if (i < n && dist[(i + 1) * w + j]! + 1 === d) {
      ops.push("delete");
      i++;
    } else {
      ops.push("insert");
      j++;
    }
  }
  return ops;
}

export function diffLines(a: string[], b: string[]): Edit[] {
  const out: Edit[] = [];
  let i = 0;
  let j = 0;
  for (const op of script(a, b)) {
    if (op === "keep") {
      out.push({ op, line: a[i]! });
      i++;
      j++;
    } else if (op === "delete") out.push({ op, line: a[i++]! });
    else out.push({ op, line: b[j++]! });
  }
  return out;
}

interface Line {
  text: string;
  eol: boolean;
}

function split(text: string): Line[] {
  if (text === "") return [];
  const parts = text.split("\n");
  const eolAtEnd = parts[parts.length - 1] === "";
  if (eolAtEnd) parts.pop();
  return parts.map((t, i) => ({ text: t, eol: i < parts.length - 1 || eolAtEnd }));
}

const key = (l: Line) => (l.eol ? `${l.text}\n` : l.text);
const NO_EOL = "\\ No newline at end of file\n";

export function unifiedDiff(a: string, b: string, options: UnifiedOptions = {}): string {
  if (a === b) return "";
  const context = options.context ?? 3;
  const al = split(a);
  const bl = split(b);
  const ops = script(al.map(key), bl.map(key));
  // Position in a and b before each op.
  const pos: { i: number; j: number }[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    pos.push({ i, j });
    if (op !== "insert") i++;
    if (op !== "delete") j++;
  }
  const changes = ops.flatMap((op, k) => (op === "keep" ? [] : [k]));
  let out = `--- ${options.fromFile ?? "a"}\n+++ ${options.toFile ?? "b"}\n`;
  let c = 0;
  while (c < changes.length) {
    let last = changes[c]!;
    let d = c + 1;
    while (d < changes.length && changes[d]! - last - 1 <= 2 * context) {
      last = changes[d]!;
      d++;
    }
    const from = Math.max(0, changes[c]! - context);
    const to = Math.min(ops.length - 1, last + context);
    let aLen = 0;
    let bLen = 0;
    let body = "";
    for (let k = from; k <= to; k++) {
      const op = ops[k]!;
      const { i: pi, j: pj } = pos[k]!;
      if (op === "keep") {
        aLen++;
        bLen++;
        const l = al[pi]!;
        body += ` ${l.text}\n${l.eol ? "" : NO_EOL}`;
      } else if (op === "delete") {
        aLen++;
        const l = al[pi]!;
        body += `-${l.text}\n${l.eol ? "" : NO_EOL}`;
      } else {
        bLen++;
        const l = bl[pj]!;
        body += `+${l.text}\n${l.eol ? "" : NO_EOL}`;
      }
    }
    const aStart = aLen === 0 ? pos[from]!.i : pos[from]!.i + 1;
    const bStart = bLen === 0 ? pos[from]!.j : pos[from]!.j + 1;
    const range = (s: number, len: number) => (len === 1 ? `${s}` : `${s},${len}`);
    out += `@@ -${range(aStart, aLen)} +${range(bStart, bLen)} @@\n${body}`;
    c = d;
  }
  return out;
}

type BodyLine = { op: Op; line: Line };

export function applyPatch(a: string, patch: string): string {
  if (patch === "") return a;
  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  if (lines.length < 2 || !lines[0]!.startsWith("--- ") || !lines[1]!.startsWith("+++ ")) {
    throw new PatchError("missing file headers");
  }
  const hunks: { oldStart: number; oldLen: number; body: BodyLine[] }[] = [];
  let k = 2;
  while (k < lines.length) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[k]!);
    if (!m) throw new PatchError(`bad hunk header on line ${k + 1}`);
    const oldStart = Number(m[1]);
    const oldLen = m[2] === undefined ? 1 : Number(m[2]);
    const newLen = m[4] === undefined ? 1 : Number(m[4]);
    k++;
    const body: BodyLine[] = [];
    while (k < lines.length && !lines[k]!.startsWith("@@")) {
      const l = lines[k]!;
      const ch = l[0];
      if (ch === " " || ch === "-" || ch === "+") {
        body.push({ op: ch === " " ? "keep" : ch === "-" ? "delete" : "insert", line: { text: l.slice(1), eol: true } });
      } else if (ch === "\\") {
        const prev = body[body.length - 1];
        if (!prev || !prev.line.eol) throw new PatchError(`misplaced marker on line ${k + 1}`);
        prev.line.eol = false;
      } else throw new PatchError(`bad line ${k + 1}`);
      k++;
    }
    const olds = body.filter((b) => b.op !== "insert").length;
    const news = body.filter((b) => b.op !== "delete").length;
    if (olds !== oldLen || news !== newLen) throw new PatchError("hunk length mismatch");
    if (oldLen > 0 && oldStart === 0) throw new PatchError("bad hunk start");
    hunks.push({ oldStart, oldLen, body });
  }
  const al = split(a);
  const out: Line[] = [];
  let p = 0;
  for (const h of hunks) {
    let idx = h.oldLen === 0 ? h.oldStart : h.oldStart - 1;
    if (idx < p || idx > al.length) throw new PatchError("hunk out of order or out of range");
    out.push(...al.slice(p, idx));
    for (const b of h.body) {
      if (b.op !== "insert") {
        out.push(b.line);
        continue;
      }
      const cur = al[idx];
      if (!cur || cur.text !== b.line.text || cur.eol !== b.line.eol) {
        throw new PatchError(`mismatch at line ${idx + 1}`);
      }
      if (b.op === "keep") out.push(cur);
      idx++;
    }
    p = idx;
  }
  out.push(...al.slice(p));
  for (let x = 0; x < out.length - 1; x++) {
    if (!out[x]!.eol) throw new PatchError("a line without a newline is not last");
  }
  return out.map((l) => l.text + (l.eol ? "\n" : "")).join("");
}
