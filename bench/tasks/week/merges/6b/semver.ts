export class SemverError extends Error {}
type V = { major: number; minor: number; patch: number; pre: (string | number)[] };
const NUM = "(0|[1-9]\\d*)", ID = "(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)";
const RE = new RegExp(`^v?${NUM}\\.${NUM}\\.${NUM}(?:-(${ID}(?:\\.${ID})*))?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`);
export function parse(v: string): V {
  const m = RE.exec(v);
  if (!m) throw new SemverError(`bad version ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".").map((x) => (/^\d+$/.test(x) ? +x : x)) : [] };
}
const sign = (x: number) => (x < 0 ? -1 : x > 0 ? 1 : 0) as -1 | 0 | 1;
function cmp(a: V, b: V): -1 | 0 | 1 {
  for (const k of ["major", "minor", "patch"] as const) if (a[k] !== b[k]) return sign(a[k] - b[k]);
  if (!a.pre.length || !b.pre.length) return sign(b.pre.length - a.pre.length);
  for (let i = 0; i <= Math.min(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return sign(x - y);
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return sign(a.pre.length - b.pre.length);
}
export function compare(a: string, b: string) { return cmp(parse(a), parse(b)); }
type C = { op: string; v: V };
const mk = (major: number, minor: number, patch: number): V => ({ major, minor, patch, pre: [] });
function expand(c: string): C[] {
  if (c === "*" || /^[xX*]$/.test(c)) return [];
  let m = /^(>=|<=|>|<|=)?(.*)$/.exec(c)!;
  let op = m[1] ?? "", rest = m[2];
  if (rest.startsWith("^") || rest.startsWith("~")) {
    const v = parse(rest.slice(1));
    const hi = rest[0] === "~" ? mk(v.major, v.minor + 1, 0) : v.major > 0 ? mk(v.major + 1, 0, 0) : v.minor > 0 ? mk(0, v.minor + 1, 0) : mk(0, 0, v.patch + 1);
    return [{ op: ">=", v }, { op: "<", v: hi }];
  }
  const parts = rest.replace(/^v/, "").split(/[.](?![^-+]*$)|\.(?=[0-9xX*])/);
  const xm = /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(rest);
  if (xm && (xm[2] === undefined || xm[3] === undefined || /[xX*]/.test(xm[2] + xm[3]))) {
    const maj = +xm[1];
    const min = xm[2] === undefined || /[xX*]/.test(xm[2]) ? null : +xm[2];
    if (min === null) return [{ op: ">=", v: mk(maj, 0, 0) }, { op: "<", v: mk(maj + 1, 0, 0) }];
    return [{ op: ">=", v: mk(maj, min, 0) }, { op: "<", v: mk(maj, min + 1, 0) }];
  }
  void parts;
  return [{ op: op || "=", v: parse(rest) }];
}
function holds(v: V, c: C) {
  const r = cmp(v, c.v);
  return c.op === ">=" ? r >= 0 : c.op === ">" ? r > 0 : c.op === "<=" ? r <= 0 : c.op === "<" ? r < 0 : r === 0;
}
export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  return range.split("||").some((set) => {
    const cs = set.trim().split(/\s+/).filter(Boolean).flatMap(expand);
    if (!cs.every((c) => holds(v, c))) return false;
    if (!v.pre.length) return true;
    return cs.some((c) => c.v.pre.length && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch);
  });
}
