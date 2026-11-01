// An expression language: lexer, Pratt parser, evaluator. See README.md, "expr".

export class ExprSyntaxError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(`${message} at ${line}:${col}`);
    this.name = "ExprSyntaxError";
    this.line = line;
    this.col = col;
  }
}

export class ExprRuntimeError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(`${message} at ${line}:${col}`);
    this.name = "ExprRuntimeError";
    this.line = line;
    this.col = col;
  }
}

type TokType = "num" | "str" | "ident" | "kw" | "op" | "eof";
interface Tok {
  type: TokType;
  value: string;
  num: number;
  line: number;
  col: number;
}

const OPS = [
  "**", "==", "!=", "<=", ">=", "&&", "||", "=>",
  "+", "-", "*", "/", "%", "<", ">", "!", "?", ":", ".", ",", "(", ")", "[", "]",
];
const KEYWORDS = new Set(["true", "false", "null", "in"]);

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isIdentStart = (c: string | undefined) =>
  c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_");
const isIdentPart = (c: string | undefined) => isIdentStart(c) || isDigit(c);
const isHex = (c: string | undefined) => c !== undefined && /^[0-9a-fA-F]$/.test(c);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const advance = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const push = (type: TokType, value: string, l: number, c: number, num = 0) =>
    toks.push({ type, value, num, line: l, col: c });

  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance(1);
      continue;
    }
    const l = line;
    const cc = col;
    if (isDigit(c)) {
      let j = i;
      while (isDigit(src[j])) j++;
      if (src[j] === "." && isDigit(src[j + 1])) {
        j++;
        while (isDigit(src[j])) j++;
      }
      if (
        (src[j] === "e" || src[j] === "E") &&
        (isDigit(src[j + 1]) || ((src[j + 1] === "+" || src[j + 1] === "-") && isDigit(src[j + 2])))
      ) {
        j += 2;
        while (isDigit(src[j])) j++;
      }
      const text = src.slice(i, j);
      push("num", text, l, cc, Number(text));
      advance(j - i);
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = "";
      for (;;) {
        const d = src[j];
        if (d === undefined || d === "\n") throw new ExprSyntaxError("unterminated string", l, cc);
        if (d === c) break;
        if (d === "\\") {
          const e = src[j + 1];
          const bcol = cc + (j - i);
          if (e === undefined || e === "\n") throw new ExprSyntaxError("unterminated string", l, cc);
          if (e === "n") out += "\n";
          else if (e === "t") out += "\t";
          else if (e === "r") out += "\r";
          else if (e === "\\") out += "\\";
          else if (e === '"') out += '"';
          else if (e === "'") out += "'";
          else if (e === "u") {
            if (src[j + 2] !== "{") throw new ExprSyntaxError("invalid escape", l, bcol);
            let k = j + 3;
            while (isHex(src[k])) k++;
            const hex = src.slice(j + 3, k);
            if (src[k] !== "}" || hex.length < 1 || hex.length > 6 || parseInt(hex, 16) > 0x10ffff) {
              throw new ExprSyntaxError("invalid escape", l, bcol);
            }
            out += String.fromCodePoint(parseInt(hex, 16));
            j = k + 1;
            continue;
          } else throw new ExprSyntaxError("invalid escape", l, bcol);
          j += 2;
          continue;
        }
        out += d;
        j++;
      }
      push("str", out, l, cc);
      advance(j + 1 - i);
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      push(KEYWORDS.has(word) ? "kw" : "ident", word, l, cc);
      advance(j - i);
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op === undefined) throw new ExprSyntaxError("unexpected character", l, cc);
    push("op", op, l, cc);
    advance(op.length);
  }
  push("eof", "", line, col);
  return toks;
}

type Node =
  | { k: "lit"; v: Value }
  | { k: "ident"; name: string; tok: Tok }
  | { k: "arr"; items: Node[] }
  | { k: "unary"; op: string; tok: Tok; arg: Node }
  | { k: "bin"; op: string; tok: Tok; l: Node; r: Node }
  | { k: "cond"; c: Node; a: Node; b: Node }
  | { k: "member"; obj: Node; name: string; tok: Tok }
  | { k: "index"; obj: Node; idx: Node; tok: Tok }
  | { k: "call"; fn: Node; args: Node[]; tok: Tok }
  | { k: "lambda"; params: string[]; body: Node };

const BINARY: Record<string, number> = {
  "||": 2, "&&": 3, "==": 4, "!=": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, in: 5,
  "+": 6, "-": 6, "*": 7, "/": 7, "%": 7,
};

class Parser {
  toks: Tok[];
  pos = 0;
  constructor(toks: Tok[]) {
    this.toks = toks;
  }
  peek(o = 0): Tok {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)]!;
  }
  next(): Tok {
    const t = this.peek();
    if (this.pos < this.toks.length - 1) this.pos++;
    return t;
  }
  is(t: Tok, v: string): boolean {
    return (t.type === "op" || t.type === "kw") && t.value === v;
  }
  fail(t: Tok): never {
    throw new ExprSyntaxError(t.type === "eof" ? "unexpected end of input" : "unexpected token", t.line, t.col);
  }
  expect(v: string): Tok {
    const t = this.peek();
    if (!this.is(t, v)) this.fail(t);
    return this.next();
  }
  parseProgram(): Node {
    const e = this.parseExpr(0);
    const t = this.peek();
    if (t.type !== "eof") this.fail(t);
    return e;
  }
  parseExpr(minBp: number): Node {
    let left = this.parseExpo();
    for (;;) {
      const t = this.peek();
      if (this.is(t, "?") && minBp <= 1) {
        this.next();
        const a = this.parseExpr(0);
        this.expect(":");
        const b = this.parseExpr(1);
        left = { k: "cond", c: left, a, b };
        continue;
      }
      const bp = (t.type === "op" || t.type === "kw") && Object.hasOwn(BINARY, t.value) ? BINARY[t.value]! : 0;
      if (bp === 0 || bp < minBp) return left;
      this.next();
      const r = this.parseExpr(bp + 1);
      left = { k: "bin", op: t.value, tok: t, l: left, r };
    }
  }
  parseExpo(): Node {
    const t = this.peek();
    if (this.is(t, "-") || this.is(t, "!")) {
      const u = this.parseUnary();
      const n = this.peek();
      if (this.is(n, "**")) throw new ExprSyntaxError("unary operator before **", n.line, n.col);
      return u;
    }
    const base = this.parsePostfix();
    const n = this.peek();
    if (this.is(n, "**")) {
      this.next();
      const r = this.parseExpo();
      return { k: "bin", op: "**", tok: n, l: base, r };
    }
    return base;
  }
  parseUnary(): Node {
    const t = this.peek();
    if (this.is(t, "-") || this.is(t, "!")) {
      this.next();
      return { k: "unary", op: t.value, tok: t, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }
  parsePostfix(): Node {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (this.is(t, ".")) {
        this.next();
        const n = this.peek();
        if (n.type !== "ident") this.fail(n);
        this.next();
        e = { k: "member", obj: e, name: n.value, tok: t };
      } else if (this.is(t, "[")) {
        this.next();
        const idx = this.parseExpr(0);
        this.expect("]");
        e = { k: "index", obj: e, idx, tok: t };
      } else if (this.is(t, "(")) {
        this.next();
        const args: Node[] = [];
        if (!this.is(this.peek(), ")")) {
          args.push(this.parseExpr(0));
          while (this.is(this.peek(), ",")) {
            this.next();
            args.push(this.parseExpr(0));
          }
        }
        this.expect(")");
        e = { k: "call", fn: e, args, tok: t };
      } else return e;
    }
  }
  lambdaAhead(): boolean {
    // At "(": is this "(" [ident {"," ident}] ")" "=>" ?
    let o = 1;
    if (this.is(this.peek(o), ")")) return this.is(this.peek(o + 1), "=>");
    for (;;) {
      if (this.peek(o).type !== "ident") return false;
      o++;
      if (this.is(this.peek(o), ",")) {
        o++;
        continue;
      }
      if (this.is(this.peek(o), ")")) return this.is(this.peek(o), "=>");
      return false;
    }
  }
  parsePrimary(): Node {
    const t = this.peek();
    if (t.type === "num") {
      this.next();
      return { k: "lit", v: t.num };
    }
    if (t.type === "str") {
      this.next();
      return { k: "lit", v: t.value };
    }
    if (t.type === "kw" && t.value !== "in") {
      this.next();
      return { k: "lit", v: t.value === "true" ? true : t.value === "true" ? false : null };
    }
    if (t.type === "ident") {
      this.next();
      if (this.is(this.peek(), "=>")) {
        this.next();
        return { k: "lambda", params: [t.value], body: this.parseExpr(0) };
      }
      return { k: "ident", name: t.value, tok: t };
    }
    if (this.is(t, "(")) {
      if (this.lambdaAhead()) {
        this.next();
        const params: string[] = [];
        while (!this.is(this.peek(), ")")) {
          const p = this.next();
          if (params.includes(p.value)) throw new ExprSyntaxError("duplicate parameter", p.line, p.col);
          params.push(p.value);
          if (this.is(this.peek(), ",")) this.next();
        }
        this.next();
        this.expect("=>");
        return { k: "lambda", params, body: this.parseExpr(0) };
      }
      this.next();
      const e = this.parseExpr(0);
      this.expect(")");
      return e;
    }
    if (this.is(t, "[")) {
      this.next();
      const items: Node[] = [];
      if (!this.is(this.peek(), "]")) {
        items.push(this.parseExpr(0));
        while (this.is(this.peek(), ",")) {
          this.next();
          items.push(this.parseExpr(0));
        }
      }
      this.expect("]");
      return { k: "arr", items };
    }
    this.fail(t);
  }
}

type Value = number | string | boolean | null | Value[] | { [key: string]: Value } | Fn;

abstract class Fn {}
class Lambda extends Fn {
  constructor(public params: string[], public body: Node, public scope: Scope) {
    super();
  }
}
class Builtin extends Fn {
  constructor(public name: string, public impl: (args: Value[], ctx: CallCtx) => Value) {
    super();
  }
}
interface CallCtx {
  fail(message: string): never;
  apply(f: Value, args: Value[]): Value;
}

interface Scope {
  vars: Map<string, Value>;
  parent: Scope | null;
}

const isObj = (v: Value): v is { [key: string]: Value } =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Fn);

const host = (v: unknown): Value => (v === undefined ? null : (v as Value));

function truthy(v: Value): boolean {
  if (v === false || v === null || v === 0 || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function deepEq(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEq(x, host(b[i])));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEq(host(a[k]), host(b[k])));
  }
  return false;
}

function roundHalfEven(x: number, places: number): number {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(x));
  if (!m) return x;
  const sign = m[1] === "-" ? -1n : 1n;
  const frac = m[3] ?? "";
  let mant = BigInt(m[2]! + frac);
  const exp = Number(m[4] ?? "0") - frac.length; // value = mant * 10^exp
  const shift = exp + places;
  let q: bigint;
  if (shift >= 0) q = mant * 10n ** BigInt(shift);
  else {
    const div = 10n ** BigInt(-shift);
    q = mant / div;
    const rem = mant % div;
    if (2n * rem > div || (2n * rem === div && q % 2n === 1n)) q += 1n;
  }
  mant = q;
  let s = mant.toString();
  if (places > 0) {
    s = s.padStart(places + 1, "0");
    s = `${s.slice(0, s.length - places)}.${s.slice(s.length - places)}`;
  }
  const r = Number(s) * Number(sign);
  return r === 0 ? 0 : r;
}

function builtin(name: string, arity: number[], impl: (args: Value[], ctx: CallCtx) => Value): Builtin {
  return new Builtin(name, (args, ctx) => {
    if (!arity.includes(args.length)) ctx.fail(`${name} expects ${arity.join(" or ")} arguments`);
    return impl(args, ctx);
  });
}

const BUILTINS: Record<string, Builtin> = {
  len: builtin("len", [1], ([x], ctx) => {
    if (typeof x === "string" || Array.isArray(x)) return x.length;
    if (isObj(x!)) return Object.keys(x).length;
    return ctx.fail("len expects a string, array or object");
  }),
  upper: builtin("upper", [1], ([x], ctx) =>
    typeof x === "string" ? x.toUpperCase() : ctx.fail("upper expects a string"),
  ),
  lower: builtin("lower", [1], ([x], ctx) =>
    typeof x === "string" ? x.toLowerCase() : ctx.fail("lower expects a string"),
  ),
  keys: builtin("keys", [1], ([x], ctx) => (isObj(x!) ? Object.keys(x).sort() : ctx.fail("keys expects an object"))),
  sum: builtin("sum", [1], ([x], ctx) => {
    if (!Array.isArray(x)) return ctx.fail("sum expects an array");
    let s = 0;
    for (const v of x) {
      if (typeof v !== "number") return ctx.fail("sum expects numbers");
      s += v;
    }
    if (!Number.isFinite(s)) return ctx.fail("non-finite result");
    return s;
  }),
  map: builtin("map", [2], ([xs, f], ctx) => {
    if (!Array.isArray(xs) || !(f instanceof Fn)) return ctx.fail("map expects an array and a function");
    return xs.map((v) => ctx.apply(f, [host(v)]));
  }),
  filter: builtin("filter", [2], ([xs, f], ctx) => {
    if (!Array.isArray(xs) || !(f instanceof Fn)) return ctx.fail("filter expects an array and a function");
    return xs.filter((v) => truthy(ctx.apply(f, [host(v)])));
  }),
  round: builtin("round", [1, 2], ([x, p], ctx) => {
    if (typeof x !== "number") return ctx.fail("round expects a number");
    const places = p === undefined ? 0 : p;
    if (typeof places !== "number" || !Number.isInteger(places) || places < 0 || places > 15) {
      return ctx.fail("round expects places from 0 to 15");
    }
    return roundHalfEven(x, places);
  }),
};

class Evaluator {
  constructor(private env: Record<string, unknown>) {}

  err(message: string, tok: Tok): never {
    throw new ExprRuntimeError(message, tok.line, tok.col);
  }

  lookup(name: string, scope: Scope | null, tok: Tok): Value {
    for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name)!;
    if (Object.hasOwn(this.env, name)) return host(this.env[name]);
    if (Object.hasOwn(BUILTINS, name)) return BUILTINS[name]!;
    return this.err(`unknown identifier ${name}`, tok);
  }

  apply(f: Value, args: Value[], tok: Tok): Value {
    if (f instanceof Lambda) {
      if (args.length !== f.params.length) this.err("wrong number of arguments", tok);
      const vars = new Map<string, Value>();
      f.params.forEach((p, i) => vars.set(p, args[i]!));
      return this.eval(f.body, { vars, parent: f.scope });
    }
    if (f instanceof Builtin) {
      return f.impl(args, {
        fail: (m) => this.err(m, tok),
        apply: (g, a) => this.apply(g, a, tok),
      });
    }
    return this.err("not a function", tok);
  }

  eval(n: Node, scope: Scope | null): Value {
    switch (n.k) {
      case "lit":
        return n.v;
      case "ident":
        return this.lookup(n.name, scope, n.tok);
      case "arr":
        return n.items.map((i) => this.eval(i, scope));
      case "lambda":
        return new Lambda(n.params, n.body, scope ?? { vars: new Map(), parent: null });
      case "cond":
        return truthy(this.eval(n.c, scope)) ? this.eval(n.a, scope) : this.eval(n.b, scope);
      case "unary": {
        const v = this.eval(n.arg, scope);
        if (n.op === "!") return !truthy(v);
        if (typeof v !== "number") return this.err("unary - expects a number", n.tok);
        return -v;
      }
      case "member": {
        const o = this.eval(n.obj, scope);
        if (!isObj(o)) return this.err("member access on a non-object", n.tok);
        return Object.hasOwn(o, n.name) ? host(o[n.name]) : null;
      }
      case "index": {
        const o = this.eval(n.obj, scope);
        const i = this.eval(n.idx, scope);
        if (Array.isArray(o) || typeof o === "string") {
          if (typeof i !== "number" || !Number.isInteger(i)) return this.err("index must be an integer", n.tok);
          const k = i < 0 ? o.length + i : i;
          if (k < 0 || k >= o.length) return null;
          return host(o[k]);
        }
        if (isObj(o)) {
          if (typeof i !== "string") return this.err("object key must be a string", n.tok);
          return Object.hasOwn(o, i) ? host(o[i]) : null;
        }
        return this.err("cannot index this value", n.tok);
      }
      case "call": {
        const f = this.eval(n.fn, scope);
        const args = n.args.map((a) => this.eval(a, scope));
        if (!(f instanceof Fn)) return this.err("not a function", n.tok);
        return this.apply(f, args, n.tok);
      }
      case "bin":
        return this.binary(n, scope);
    }
  }

  binary(n: Extract<Node, { k: "bin" }>, scope: Scope | null): Value {
    if (n.op === "&&") {
      const l = this.eval(n.l, scope);
      return truthy(l) ? this.eval(n.r, scope) : l;
    }
    if (n.op === "||") {
      const l = this.eval(n.l, scope);
      return truthy(l) ? l : this.eval(n.r, scope);
    }
    const l = this.eval(n.l, scope);
    const r = this.eval(n.r, scope);
    const finite = (v: number) => (Number.isFinite(v) ? v : this.err("non-finite result", n.tok));
    switch (n.op) {
      case "+":
        if (typeof l === "number" && typeof r === "number") return finite(l + r);
        if (typeof l !== "string" && typeof r === "string") return l + r;
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        return this.err("invalid operands for +", n.tok);
      case "-":
      case "*":
      case "/":
      case "%":
      case "**": {
        if (typeof l !== "number" || typeof r !== "number") return this.err(`invalid operands for ${n.op}`, n.tok);
        if ((n.op === "/" || n.op === "%") && r === 0) return this.err("division by zero", n.tok);
        const v = n.op === "-" ? l - r : n.op === "*" ? l * r : n.op === "/" ? l / r : n.op === "%" ? l % r : l ** r;
        return finite(v);
      }
      case "==":
        return deepEq(l, r);
      case "!=":
        return !deepEq(l, r);
      case "<":
      case "<=":
      case ">":
      case ">=": {
        if (!((typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string"))) {
          return this.err(`invalid operands for ${n.op}`, n.tok);
        }
        return n.op === "<" ? l < r : n.op === "<=" ? l <= r : n.op === ">" ? l > r : l >= r;
      }
      case "in":
        if (Array.isArray(r)) return r.some((x) => deepEq(l, host(x)));
        if (typeof r === "string") {
          if (typeof l !== "string") return this.err("invalid operands for in", n.tok);
          return r.includes(l);
        }
        if (isObj(r)) {
          if (typeof l !== "string") return this.err("invalid operands for in", n.tok);
          return Object.hasOwn(r, l);
        }
        return this.err("invalid operands for in", n.tok);
    }
    return this.err(`unknown operator ${n.op}`, n.tok);
  }
}

export function evaluate(src: string, env: Record<string, unknown> = {}): unknown {
  const ast = new Parser(lex(src)).parseProgram();
  return new Evaluator(env).eval(ast, null);
}
