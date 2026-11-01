// A SQL-like query over arrays of plain objects. See README.md, "query".

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}

export type Scalar = number | string | boolean | null;
export type Row = Record<string, Scalar>;

const KEYWORDS = new Set([
  "SELECT", "DISTINCT", "FROM", "AS", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC",
  "LIMIT", "OFFSET", "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE", "IS", "NULL", "TRUE", "FALSE",
  "COUNT", "SUM", "AVG", "MIN", "MAX",
]);
const AGGS = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);

type TokType = "num" | "str" | "ident" | "kw" | "op" | "eof";
interface Tok {
  type: TokType;
  value: string;
  start: number;
  end: number;
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    const start = i;
    if (c >= "0" && c <= "9") {
      while (i < src.length && /[0-9]/.test(src[i]!)) i++;
      if (src[i] === "." && /[0-9]/.test(src[i + 1] ?? "")) {
        i++;
        while (i < src.length && /[0-9]/.test(src[i]!)) i++;
      }
      toks.push({ type: "num", value: src.slice(start, i), start, end: i });
      continue;
    }
    if (c === "'") {
      let out = "";
      i++;
      for (;;) {
        if (i >= src.length) throw new QueryError("unterminated string");
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += src[i];
        i++;
      }
      toks.push({ type: "str", value: out, start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i]!)) i++;
      const word = src.slice(start, i);
      const up = word.toUpperCase();
      if (KEYWORDS.has(up)) toks.push({ type: "kw", value: up, start, end: i });
      else toks.push({ type: "ident", value: word, start, end: i });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<>" || two === "!=" || two === "<=" || two === ">=") {
      toks.push({ type: "op", value: two, start, end: i + 2 });
      i += 2;
      continue;
    }
    if ("=<>+-*/%(),.".includes(c)) {
      toks.push({ type: "op", value: c, start, end: i + 1 });
      i++;
      continue;
    }
    throw new QueryError(`unexpected character ${c}`);
  }
  toks.push({ type: "eof", value: "", start: src.length, end: src.length });
  return toks;
}

type Expr =
  | { k: "lit"; v: Scalar; int: boolean; start: number; end: number }
  | { k: "col"; q: string | null; name: string; start: number; end: number }
  | { k: "neg"; e: Expr; start: number; end: number }
  | { k: "bin"; op: string; l: Expr; r: Expr; start: number; end: number }
  | { k: "not"; e: Expr; start: number; end: number }
  | { k: "isnull"; e: Expr; neg: boolean; start: number; end: number }
  | { k: "in"; e: Expr; list: Expr[]; neg: boolean; start: number; end: number }
  | { k: "between"; e: Expr; lo: Expr; hi: Expr; neg: boolean; start: number; end: number }
  | { k: "like"; e: Expr; p: Expr; neg: boolean; start: number; end: number }
  | { k: "agg"; fn: string; arg: Expr | null; distinct: boolean; start: number; end: number };

interface Item {
  expr: Expr;
  alias: string | null;
}
interface OrderItem {
  expr: Expr;
  desc: boolean;
}
interface Query {
  distinct: boolean;
  star: boolean;
  items: Item[];
  table: string;
  alias: string | null;
  where: Expr | null;
  groupBy: Expr[];
  having: Expr | null;
  orderBy: OrderItem[];
  limit: number | null;
  offset: number | null;
}

class Parser {
  pos = 0;
  constructor(private toks: Tok[]) {}
  peek(): Tok {
    return this.toks[this.pos]!;
  }
  prevEnd(): number {
    return this.toks[this.pos - 1]!.end;
  }
  next(): Tok {
    const t = this.toks[this.pos]!;
    if (t.type !== "eof") this.pos++;
    return t;
  }
  isKw(v: string): boolean {
    const t = this.peek();
    return t.type === "kw" && t.value === v;
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return t.type === "op" && t.value === v;
  }
  acceptKw(v: string): boolean {
    if (this.isKw(v)) {
      this.next();
      return true;
    }
    return false;
  }
  fail(): never {
    const t = this.peek();
    throw new QueryError(t.type === "eof" ? "unexpected end of query" : `unexpected token ${t.value}`);
  }
  kw(v: string): void {
    if (!this.acceptKw(v)) this.fail();
  }
  op(v: string): void {
    if (!this.isOp(v)) this.fail();
    this.next();
  }
  ident(): string {
    const t = this.peek();
    if (t.type !== "ident") this.fail();
    this.next();
    return t.value;
  }
  int(): number {
    const t = this.peek();
    if (t.type !== "num" || t.value.includes(".")) this.fail();
    this.next();
    return Number(t.value);
  }

  query(): Query {
    this.kw("SELECT");
    const distinct = this.acceptKw("DISTINCT");
    let star = false;
    const items: Item[] = [];
    if (this.isOp("*")) {
      this.next();
      star = true;
    } else {
      do {
        const expr = this.expr();
        const alias = this.acceptKw("AS") ? this.ident() : null;
        items.push({ expr, alias });
      } while (this.isOp(",") && this.next());
    }
    this.kw("FROM");
    const table = this.ident();
    let alias: string | null = null;
    if (this.acceptKw("AS")) alias = this.ident();
    else if (this.peek().type === "ident") alias = this.ident();
    let where: Expr | null = null;
    if (this.acceptKw("WHERE")) where = this.expr();
    const groupBy: Expr[] = [];
    if (this.acceptKw("GROUP")) {
      this.kw("BY");
      do {
        const s = this.peek().start;
        let name = this.ident();
        let q: string | null = null;
        if (this.isOp(".")) {
          this.next();
          q = name;
          name = this.ident();
        }
        groupBy.push({ k: "col", q, name, start: s, end: this.prevEnd() });
      } while (this.isOp(",") && this.next());
    }
    let having: Expr | null = null;
    if (this.acceptKw("HAVING")) having = this.expr();
    const orderBy: OrderItem[] = [];
    if (this.acceptKw("ORDER")) {
      this.kw("BY");
      do {
        const expr = this.expr();
        let desc = false;
        if (this.acceptKw("DESC")) desc = true;
        else this.acceptKw("ASC");
        orderBy.push({ expr, desc });
      } while (this.isOp(",") && this.next());
    }
    let limit: number | null = null;
    let offset: number | null = null;
    if (this.acceptKw("LIMIT")) limit = this.int();
    if (this.acceptKw("OFFSET")) offset = this.int();
    if (this.peek().type !== "eof") this.fail();
    return { distinct, star, items, table, alias, where, groupBy, having, orderBy, limit, offset };
  }

  expr(): Expr {
    let l = this.and();
    while (this.isKw("OR")) {
      this.next();
      const r = this.and();
      l = { k: "bin", op: "OR", l, r, start: l.start, end: r.end };
    }
    return l;
  }
  and(): Expr {
    let l = this.not();
    while (this.isKw("AND")) {
      this.next();
      const r = this.not();
      l = { k: "bin", op: "AND", l, r, start: l.start, end: r.end };
    }
    return l;
  }
  not(): Expr {
    if (this.isKw("NOT")) {
      const s = this.next().start;
      const e = this.not();
      return { k: "not", e, start: s, end: e.end };
    }
    return this.cmp();
  }
  cmp(): Expr {
    const l = this.add();
    const t = this.peek();
    if (t.type === "op" && ["=", "<>", "!=", "<", "<=", ">", ">="].includes(t.value)) {
      this.next();
      const r = this.add();
      return { k: "bin", op: t.value === "!=" ? "<>" : t.value, l, r, start: l.start, end: r.end };
    }
    if (this.acceptKw("IS")) {
      const neg = this.acceptKw("NOT");
      this.kw("NULL");
      return { k: "isnull", e: l, neg, start: l.start, end: this.prevEnd() };
    }
    const neg = this.acceptKw("NOT");
    if (this.acceptKw("IN")) {
      this.op("(");
      const list: Expr[] = [];
      do list.push(this.expr());
      while (this.isOp(",") && this.next());
      this.op(")");
      return { k: "in", e: l, list, neg, start: l.start, end: this.prevEnd() };
    }
    if (this.acceptKw("BETWEEN")) {
      const lo = this.add();
      this.kw("AND");
      const hi = this.add();
      return { k: "between", e: l, lo, hi, neg, start: l.start, end: hi.end };
    }
    if (this.acceptKw("LIKE")) {
      const p = this.add();
      return { k: "like", e: l, p, neg, start: l.start, end: p.end };
    }
    if (neg) this.fail();
    return l;
  }
  add(): Expr {
    let l = this.mul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().value;
      const r = this.mul();
      l = { k: "bin", op, l, r, start: l.start, end: r.end };
    }
    return l;
  }
  mul(): Expr {
    let l = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next().value;
      const r = this.unary();
      l = { k: "bin", op, l, r, start: l.start, end: r.end };
    }
    return l;
  }
  unary(): Expr {
    if (this.isOp("-")) {
      const s = this.next().start;
      const e = this.unary();
      return { k: "neg", e, start: s, end: e.end };
    }
    return this.primary();
  }
  primary(): Expr {
    const t = this.peek();
    const s = t.start;
    if (t.type === "num") {
      this.next();
      return { k: "lit", v: Number(t.value), int: !t.value.includes("."), start: s, end: t.end };
    }
    if (t.type === "str") {
      this.next();
      return { k: "lit", v: t.value, int: false, start: s, end: t.end };
    }
    if (t.type === "kw" && (t.value === "NULL" || t.value === "TRUE" || t.value === "FALSE")) {
      this.next();
      const v = t.value === "NULL" ? null : t.value === "TRUE";
      return { k: "lit", v, int: false, start: s, end: t.end };
    }
    if (t.type === "kw" && AGGS.has(t.value)) {
      this.next();
      this.op("(");
      if (t.value === "COUNT" && this.isOp("*")) {
        this.next();
        this.op(")");
        return { k: "agg", fn: "COUNT", arg: null, distinct: false, start: s, end: this.prevEnd() };
      }
      const distinct = t.value === "COUNT" && this.acceptKw("DISTINCT");
      const arg = this.expr();
      this.op(")");
      return { k: "agg", fn: t.value, arg, distinct, start: s, end: this.prevEnd() };
    }
    if (t.type === "ident") {
      this.next();
      if (this.isOp(".")) {
        this.next();
        const name = this.ident();
        return { k: "col", q: t.value, name, start: s, end: this.prevEnd() };
      }
      return { k: "col", q: null, name: t.value, start: s, end: t.end };
    }
    if (this.isOp("(")) {
      this.next();
      const e = this.expr();
      this.op(")");
      return { ...e, start: s, end: this.prevEnd() };
    }
    return this.fail();
  }
}

function children(e: Expr): Expr[] {
  switch (e.k) {
    case "lit":
    case "col":
      return [];
    case "neg":
    case "not":
    case "isnull":
      return [e.e];
    case "bin":
      return [e.l, e.r];
    case "in":
      return [e.e, ...e.list];
    case "between":
      return [e.e, e.lo, e.hi];
    case "like":
      return [e.e, e.p];
    case "agg":
      return e.arg ? [e.arg] : [];
  }
}

const hasAgg = (e: Expr): boolean => e.k === "agg" || children(e).some(hasAgg);

type Ctx = { row: Row | null; group: Row[] | null };

const typeOf = (v: Scalar) => (v === null ? "null" : typeof v);
const keyOf = (vs: Scalar[]) => JSON.stringify(vs.map((v) => [typeOf(v), v]));

function and3(a: Scalar, b: Scalar): Scalar {
  if (a === false || b === false) return false;
  if (a === null || b === null) return null;
  return true;
}
function or3(a: Scalar, b: Scalar): Scalar {
  if (a === true || b === true) return true;
  if (a === null || b === null) return null;
  return false;
}
function boolish(v: Scalar): boolean | null {
  if (v !== null && typeof v !== "boolean") throw new QueryError("expected a boolean");
  return v;
}
function order(a: Scalar, b: Scalar): number {
  if (typeOf(a) !== typeOf(b)) throw new QueryError("cannot compare values of different types");
  return (a as never) < (b as never) ? -1 : (a as never) > (b as never) ? 1 : 0;
}

function evalExpr(e: Expr, ctx: Ctx): Scalar {
  switch (e.k) {
    case "lit":
      return e.v;
    case "col": {
      const row = ctx.row;
      if (!row || !Object.hasOwn(row, e.name) || row[e.name] === undefined) return null;
      return row[e.name]!;
    }
    case "neg": {
      const v = evalExpr(e.e, ctx);
      if (v === null) return null;
      if (typeof v !== "number") throw new QueryError("unary - expects a number");
      return -v;
    }
    case "not": {
      const v = boolish(evalExpr(e.e, ctx));
      return v === null ? null : !v;
    }
    case "isnull": {
      const v = evalExpr(e.e, ctx);
      return e.neg ? v !== null : v === null;
    }
    case "in": {
      const v = evalExpr(e.e, ctx);
      let res: Scalar = false;
      for (const x of e.list) {
        const w = evalExpr(x, ctx);
        res = or3(res, eq(v, w));
      }
      return e.neg ? (res === null ? null : !res) : res;
    }
    case "between": {
      const v = evalExpr(e.e, ctx);
      const lo = evalExpr(e.lo, ctx);
      const hi = evalExpr(e.hi, ctx);
      const ge = v === null || lo === null ? null : order(v, lo) >= 0;
      const le = v === null || hi === null ? null : order(v, hi) <= 0;
      const res = and3(ge, le);
      return e.neg ? (res === null ? null : !res) : res;
    }
    case "like": {
      const v = evalExpr(e.e, ctx);
      const p = evalExpr(e.p, ctx);
      if (v === null || p === null) return null;
      if (typeof v !== "string" || typeof p !== "string") throw new QueryError("LIKE expects strings");
      const re = new RegExp(
        "^" +
          p
            .split("")
            .map((ch) => (ch === "%" ? "[\\s\\S]*" : ch === "_" ? "[\\s\\S]" : ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")))
            .join("") +
          "$",
      );
      const res = re.test(v);
      return e.neg ? !res : res;
    }
    case "bin":
      return evalBin(e, ctx);
    case "agg":
      return evalAgg(e, ctx);
  }
}

function eq(a: Scalar, b: Scalar): Scalar {
  if (a === null || b === null) return null;
  return typeOf(a) === typeOf(b) && a === b;
}

function evalBin(e: Extract<Expr, { k: "bin" }>, ctx: Ctx): Scalar {
  const l = evalExpr(e.l, ctx);
  const r = evalExpr(e.r, ctx);
  switch (e.op) {
    case "AND":
      return and3(boolish(l), boolish(r));
    case "OR":
      return or3(boolish(l), boolish(r));
    case "=":
      return eq(l, r);
    case "<>": {
      const v = eq(l, r);
      return v === null ? null : !v;
    }
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (l === null || r === null) return null;
      const c = order(l, r);
      return e.op === "<" ? c < 0 : e.op === "<=" ? c <= 0 : e.op === ">" ? c > 0 : c >= 0;
    }
  }
  if (l === null || r === null) return null;
  if (typeof l !== "number" || typeof r !== "number") throw new QueryError(`${e.op} expects numbers`);
  switch (e.op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      return r === 0 ? null : l / r;
    case "%":
      return r === 0 ? null : l % r;
  }
  throw new QueryError(`unknown operator ${e.op}`);
}

function evalAgg(e: Extract<Expr, { k: "agg" }>, ctx: Ctx): Scalar {
  const rows = ctx.group ?? [];
  if (e.arg === null) return rows.length;
  const vals = rows.map((row) => evalExpr(e.arg!, { row, group: null })).filter((v) => v !== null);
  switch (e.fn) {
    case "COUNT":
      return e.distinct ? new Set(vals.map((v) => keyOf([v]))).size : vals.length;
    case "SUM":
    case "AVG": {
      if (vals.length === 0) return null;
      let s = 0;
      for (const v of vals) {
        if (typeof v !== "number") throw new QueryError(`${e.fn} expects numbers`);
        s += v;
      }
      return e.fn === "SUM" ? s : s / vals.length;
    }
    default: {
      if (vals.length === 0) return null;
      let best = vals[0]!;
      for (const v of vals) {
        const c = order(v, best);
        if (e.fn === "MIN" ? c < 0 : c > 0) best = v;
      }
      return best;
    }
  }
}

export function query(sql: string, tables: Record<string, Row[]>): Row[] {
  const q = new Parser(lex(sql)).query();
  if (!Object.hasOwn(tables, q.table) || !Array.isArray(tables[q.table])) {
    throw new QueryError(`unknown table ${q.table}`);
  }
  const rows = tables[q.table]!;
  const columns: string[] = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);
  const qualifier = q.alias ?? q.table;

  const checkCols = (e: Expr) => {
    if (e.k === "col") {
      if (e.q !== null && e.q !== qualifier) throw new QueryError(`unknown table or alias ${e.q}`);
      if (!columns.includes(e.name)) throw new QueryError(`unknown column ${e.name}`);
    }
    children(e).forEach(checkCols);
  };
  const checkAggs = (e: Expr, inAgg: boolean) => {
    if (e.k === "agg" && inAgg) throw new QueryError("nested aggregate");
    children(e).forEach((c) => checkAggs(c, inAgg || e.k !== "agg"));
  };

  // Output names.
  const names = q.star
    ? [...columns]
    : q.items.map((it) => it.alias ?? (it.expr.k === "col" ? it.expr.name : sql.slice(it.expr.start, it.expr.end)));
  for (let i = 0; i < names.length; i++) {
    if (names.indexOf(names[i]!) !== i) throw new QueryError(`duplicate column ${names[i]}`);
  }

  // ORDER BY resolution.
  type Key = { kind: "out"; index: number; desc: boolean } | { kind: "expr"; expr: Expr; desc: boolean };
  const keys: Key[] = q.orderBy.map((o) => {
    const e = o.expr;
    if (e.k === "lit" && typeof e.v === "number") {
      if (!e.int) throw new QueryError(`ORDER BY position ${sql.slice(e.start, e.end)} is not an integer`);
      if (e.v < 1 || e.v > names.length) throw new QueryError(`ORDER BY position ${e.v} out of range`);
      return { kind: "out", index: e.v - 1, desc: o.desc };
    }
    if (e.k === "col" && e.q === null && names.includes(e.name)) {
      return { kind: "out", index: names.indexOf(e.name), desc: o.desc };
    }
    if (q.distinct) throw new QueryError("ORDER BY with DISTINCT must name an output column");
    return { kind: "expr", expr: e, desc: o.desc };
  });

  const selectExprs = q.items.map((i) => i.expr);
  const orderExprs = keys.flatMap((k) => (k.kind === "expr" ? [k.expr] : []));
  for (const e of [...selectExprs, ...q.groupBy, ...orderExprs]) checkCols(e);
  if (q.where) checkCols(q.where);
  if (q.having) checkCols(q.having);
  if (q.where && hasAgg(q.where)) throw new QueryError("aggregate in WHERE");
  for (const e of [...selectExprs, ...orderExprs, ...(q.having ? [q.having] : [])]) checkAggs(e, false);

  const grouped =
    q.groupBy.length > 0 || q.having !== null || selectExprs.some(hasAgg) || orderExprs.some(hasAgg);
  if (grouped) {
    if (q.star) throw new QueryError("* in a grouped query");
    const groupCols = q.groupBy.map((g) => (g.k === "col" ? g.name : ""));
    const checkGrouped = (e: Expr) => {
      if (e.k === "agg") return;
      if (e.k === "col" && !groupCols.includes(e.name)) {
        throw new QueryError(`column ${e.name} must appear in GROUP BY or in an aggregate`);
      }
      children(e).forEach(checkGrouped);
    };
    for (const e of [...selectExprs, ...orderExprs, ...(q.having ? [q.having] : [])]) checkGrouped(e);
  }

  // WHERE.
  const kept = rows.filter((row) => (q.where ? boolish(evalExpr(q.where, { row, group: null })) === true : true));

  // Contexts.
  let ctxs: Ctx[];
  if (grouped) {
    if (q.groupBy.length === 0) ctxs = [{ row: kept[0] ?? null, group: kept }];
    else {
      const map = new Map<string, Ctx>();
      for (const row of kept) {
        const k = keyOf(q.groupBy.map((g) => evalExpr(g, { row, group: null })));
        const c = map.get(k);
        if (c) c.group!.push(row);
        else map.set(k, { row, group: [row] });
      }
      ctxs = [...map.values()];
    }
    if (q.having) ctxs = ctxs.filter((c) => boolish(evalExpr(q.having!, c)) === true);
  } else ctxs = kept.map((row) => ({ row, group: null }));

  // Projection.
  let out = ctxs.map((ctx) => {
    const r: Row = {};
    if (q.star) for (const c of columns) r[c] = evalExpr({ k: "col", q: null, name: c, start: 0, end: 0 }, ctx);
    else q.items.forEach((it, i) => (r[names[i]!] = evalExpr(it.expr, ctx)));
    return { ctx, r };
  });

  if (q.distinct) {
    const seen = new Set<string>();
    out = out.filter(({ r }) => {
      const k = keyOf(names.map((n) => r[n]!));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (keys.length > 0) {
    const vals = out.map(({ ctx, r }) =>
      keys.map((k) => (k.kind === "out" ? r[names[k.index]!]! : evalExpr(k.expr, ctx))),
    );
    keys.forEach((_, j) => {
      const types = new Set(vals.map((v) => typeOf(v[j]!)).filter((t) => t !== "null"));
      if (types.size > 1) throw new QueryError("cannot order values of different types");
    });
    const idx = out.map((_, i) => i);
    idx.sort((a, b) => {
      for (let j = 0; j < keys.length; j++) {
        const x = vals[a]![j]!;
        const y = vals[b]![j]!;
        let c = x === null && y === null ? 0 : x === null ? -1 : y === null ? 1 : order(x, y);
        if (keys[j]!.desc) c = -c;
        if (c !== 0) return c;
      }
      return a - b;
    });
    out = idx.map((i) => out[i]!);
  }

  let result = out.map(({ r }) => r);
  if (q.offset !== null) result = result.slice(q.offset);
  if (q.limit !== null) result = result.slice(0, q.limit);
  return result;
}
