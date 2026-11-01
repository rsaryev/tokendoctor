export class RouterError extends Error {}
type Seg = { kind: 0 | 1 | 2; name: string };
const segs = (p: string) => p.split("/").filter(Boolean);
export class Router<T> {
  private routes: { pattern: string; segs: Seg[]; value: T }[] = [];
  add(pattern: string, value: T) {
    const key = "/" + segs(pattern).join("/");
    if (this.routes.some((r) => r.pattern === key)) throw new RouterError("duplicate");
    this.routes.push({ pattern: key, value, segs: segs(pattern).map((s) => s.startsWith(":") ? { kind: 1, name: s.slice(1) } : s.startsWith("*") ? { kind: 2, name: s.slice(1) } : { kind: 0, name: s }) });
  }
  match(path: string) {
    const [p, q = ""] = path.split(/\?(.*)/s);
    const parts = segs(p);
    const query: Record<string, string> = {};
    for (const kv of q.split("&").filter(Boolean)) {
      const [k, v = ""] = kv.split(/=(.*)/s);
      const d = (x: string) => decodeURIComponent(x.replaceAll("+", " "));
      query[d(k)] = d(v);
    }
    let best: { ranks: number[]; value: T; params: Record<string, string> } | null = null;
    for (const r of this.routes) {
      const params: Record<string, string> = {}, ranks: number[] = [];
      let ok = true;
      for (let i = 0; i < r.segs.length; i++) {
        const s = r.segs[i];
        if (s.kind === 2) { if (i > parts.length) ok = false; else params[s.name] = parts.slice(i).map(decodeURIComponent).join("/"); ranks.push(2); break; }
        if (i >= parts.length) { ok = false; break; }
        if (s.kind === 0 && s.name !== parts[i]) { ok = false; break; }
        if (s.kind === 1) params[s.name] = decodeURIComponent(parts[i]);
        ranks.push(s.kind);
        if (i === r.segs.length - 1 && parts.length !== r.segs.length) ok = false;
      }
      if (r.segs.length === 0 && parts.length !== 0) ok = false;
      if (!ok) continue;
      if (!best || less(ranks, best.ranks)) best = { ranks, value: r.value, params };
    }
    return best ? { value: best.value, params: best.params, query } : null;
  }
}
function less(a: number[], b: number[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
