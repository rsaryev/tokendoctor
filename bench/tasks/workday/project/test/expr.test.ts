import { describe, expect, test } from "bun:test";
import { evaluate, ExprRuntimeError, ExprSyntaxError } from "../src/expr";

function thrown(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error("expected an error, none was thrown");
}

function syntaxAt(src: string, line: number, col: number, env: Record<string, unknown> = {}) {
  const e = thrown(() => evaluate(src, env));
  expect(e).toBeInstanceOf(ExprSyntaxError);
  expect(e).not.toBeInstanceOf(ExprRuntimeError);
  expect([(e as ExprSyntaxError).line, (e as ExprSyntaxError).col]).toEqual([line, col]);
}

function runtimeAt(src: string, line: number, col: number, env: Record<string, unknown> = {}) {
  const e = thrown(() => evaluate(src, env));
  expect(e).toBeInstanceOf(ExprRuntimeError);
  expect(e).not.toBeInstanceOf(ExprSyntaxError);
  expect([(e as ExprRuntimeError).line, (e as ExprRuntimeError).col]).toEqual([line, col]);
}

describe("lexing", () => {
  test("E5 integers, decimals and exponents", () => {
    expect(evaluate("42")).toBe(42);
    expect(evaluate("3.25")).toBe(3.25);
    expect(evaluate("1e3")).toBe(1000);
    expect(evaluate("2.5E-1")).toBe(0.25);
    expect(evaluate("1e+2")).toBe(100);
    expect(evaluate("007")).toBe(7);
  });

  test("E5 a trailing '.' is not part of the number", () => {
    syntaxAt("1.", 1, 3);
    syntaxAt("1.+2", 1, 3);
  });

  test("E5 an 'e' with no digits after it is an identifier", () => {
    syntaxAt("1e", 1, 2);
    syntaxAt("2 * 1e+", 1, 6);
  });

  test("E5 a number cannot start with '.'", () => {
    syntaxAt(".5", 1, 1);
  });

  test("E6 escapes in both kinds of string", () => {
    expect(evaluate(String.raw`"a\nb\t\"c\"\\"`)).toBe('a\nb\t"c"\\');
    expect(evaluate(String.raw`'it\'s \"x\"'`)).toBe(`it's "x"`);
    expect(evaluate(String.raw`"\r"`)).toBe("\r");
  });

  test("E6 unicode escapes", () => {
    expect(evaluate(String.raw`"\u{41}\u{1F600}\u{e9}"`)).toBe("A😀é");
    expect(evaluate(String.raw`"\u{0}"`)).toBe("\u0000");
  });

  test("E6 a bad escape is an error at the backslash", () => {
    syntaxAt(String.raw`"ab\q"`, 1, 4);
    syntaxAt(String.raw`'x' + "\u{110000}"`, 1, 8);
    syntaxAt(String.raw`"\u41"`, 1, 2);
    syntaxAt(String.raw`"\u{}"`, 1, 2);
    syntaxAt(String.raw`"\u{1234567}"`, 1, 2);
  });

  test("E6 an unterminated string is an error at its opening quote", () => {
    syntaxAt(`1 + "abc`, 1, 5);
    syntaxAt(`x\n  + 'ab\ncd'`, 2, 5);
    syntaxAt(`"abc\\`, 1, 1);
  });

  test("E6 the first problem met in a string is the one reported", () => {
    syntaxAt(String.raw`"\q`, 1, 2);
    syntaxAt(String.raw`'ab\u{zz`, 1, 4);
    syntaxAt(String.raw`"a\u{41`, 1, 3);
    syntaxAt(String.raw`'\u{110000`, 1, 2);
    syntaxAt(String.raw`"\u{41}`, 1, 1);
    syntaxAt(`"ok" + "\\`, 1, 8);
  });

  test("E7 E8 unknown characters and a lone '='", () => {
    syntaxAt("a = 1", 1, 3, { a: 1 });
    syntaxAt("1 & 2", 1, 3);
    syntaxAt("1 # 2", 1, 3);
    syntaxAt("1 | 2", 1, 3);
  });

  test("E1 E4 columns count tabs and \\r as one; lines split at \\n", () => {
    syntaxAt("\t\t1 +", 1, 6);
    syntaxAt("1 +\r\n\t)", 2, 2);
    syntaxAt("1 +\n\n   *", 3, 4);
  });

  test("E1 E2 the message ends with the position", () => {
    const e = thrown(() => evaluate("1 +\n  1 / 0")) as Error;
    expect(e).toBeInstanceOf(ExprRuntimeError);
    expect(e.message.endsWith(" at 2:5")).toBe(true);
    const s = thrown(() => evaluate("(1")) as Error;
    expect(s.message.endsWith(" at 1:3")).toBe(true);
  });
});

describe("grammar", () => {
  test("E9 arithmetic precedence and left associativity", () => {
    expect(evaluate("1 + 2 * 3")).toBe(7);
    expect(evaluate("(1 + 2) * 3")).toBe(9);
    expect(evaluate("10 - 4 - 3")).toBe(3);
    expect(evaluate("2 * 3 % 4")).toBe(2);
    expect(evaluate("100 / 10 / 5")).toBe(2);
  });

  test("E9 ** is right-associative and binds tighter than *", () => {
    expect(evaluate("2 ** 3 ** 2")).toBe(512);
    expect(evaluate("2 * 3 ** 2")).toBe(18);
  });

  test("E10 -2 ** 2 and friends are syntax errors at the **", () => {
    syntaxAt("-2 ** 2", 1, 4);
    syntaxAt("!x ** 2", 1, 4, { x: 1 });
    syntaxAt("-(2) ** 2", 1, 6);
    syntaxAt("2 ** -2 ** 2", 1, 9);
  });

  test("E10 (-2) ** 2 and 2 ** -2 are fine", () => {
    expect(evaluate("(-2) ** 2")).toBe(4);
    expect(evaluate("2 ** -2")).toBe(0.25);
    expect(evaluate("-2 * 3")).toBe(-6);
    expect(evaluate("--2")).toBe(2);
  });

  test("E9 E21 unary binds tighter than binary operators", () => {
    expect(evaluate("-1 + 3")).toBe(2);
    expect(evaluate("!0 == true")).toBe(true);
    expect(evaluate("2 - -2")).toBe(4);
  });

  test("E9 ternary is right-associative and loosest", () => {
    expect(evaluate("false ? 1 : true ? 2 : 3")).toBe(2);
    expect(evaluate("0 || 1 ? 'a' : 'b'")).toBe("a");
    expect(evaluate("1 ? 2 ? 'x' : 'y' : 'z'")).toBe("x");
    expect(evaluate("1 < 2 ? 1 + 1 : 0")).toBe(2);
  });

  test("E9 'in' shares the comparison level", () => {
    expect(evaluate("1 + 1 in [2] == true")).toBe(true);
    expect(evaluate("'b' in 'abc' && 'z' in 'abc'")).toBe(false);
  });

  test("E11 array literals, empty and nested", () => {
    expect(evaluate("[]")).toEqual([]);
    expect(evaluate("[1, [2, 3], 'x']")).toEqual([1, [2, 3], "x"]);
    syntaxAt("[1,]", 1, 4);
    syntaxAt("[1 2]", 1, 4);
  });

  test("E12 member names cannot be keywords; no trailing comma in calls", () => {
    syntaxAt("a.null", 1, 3, { a: {} });
    syntaxAt("len('ab',)", 1, 10);
    syntaxAt("a.", 1, 3, { a: {} });
  });

  test("E13 lambda forms", () => {
    expect(evaluate("map([1, 2], x => x * 2)")).toEqual([2, 4]);
    expect(evaluate("((a, b) => a - b)(5, 2)")).toBe(3);
    expect(evaluate("(() => 7)()")).toBe(7);
    expect(evaluate("map([0, 5], x => x > 1 ? 'big' : 'small')")).toEqual(["small", "big"]);
  });

  test("E13 a parenthesized list without => is an error at the comma", () => {
    syntaxAt("(a, b)", 1, 3, { a: 1, b: 2 });
    syntaxAt("(a, b) + 1", 1, 3, { a: 1, b: 2 });
  });

  test("E13 a repeated parameter is an error at its second occurrence", () => {
    syntaxAt("map(xs, (a, b, a) => a)", 1, 16, { xs: [] });
  });

  test("E14 end-of-input positions", () => {
    syntaxAt("1 +", 1, 4);
    syntaxAt("(1\n", 2, 1);
    syntaxAt("", 1, 1);
    syntaxAt("f(", 1, 3);
  });

  test("E14 the first token that cannot continue", () => {
    syntaxAt("1 2", 1, 3);
    syntaxAt("(1 + 2))", 1, 8);
    syntaxAt("1 ? 2", 1, 6);
    syntaxAt("1 ? 2 , 3", 1, 7);
    syntaxAt("* 3", 1, 1);
  });

  test("E3 syntax errors win over runtime errors anywhere", () => {
    syntaxAt("unknownName + (1 +", 1, 19);
    syntaxAt("1 / 0 + )", 1, 9);
  });

  test("E3 E14 the whole source is lexed before it is parsed", () => {
    syntaxAt(") #", 1, 3);
    syntaxAt(`1 + * "abc`, 1, 7);
    syntaxAt("(1 2) @", 1, 7);
    syntaxAt("1 2\n  'x", 2, 3);
    syntaxAt(String.raw`) "ok" "\q"`, 1, 9);
  });
});

describe("values and identifiers", () => {
  test("E15 literals", () => {
    expect(evaluate("true")).toBe(true);
    expect(evaluate("false")).toBe(false);
    expect(evaluate("null")).toBe(null);
    expect(evaluate("'x'")).toBe("x");
  });

  test("E16 truthiness: the empty array is falsy, an empty object and '0' are truthy", () => {
    expect(evaluate("[] ? 'y' : 'n'")).toBe("n");
    expect(evaluate("o ? 'y' : 'n'", { o: {} })).toBe("y");
    expect(evaluate("'0' ? 'y' : 'n'")).toBe("y");
    expect(evaluate("[0] ? 'y' : 'n'")).toBe("y");
    expect(evaluate("!''")).toBe(true);
    expect(evaluate("!null")).toBe(true);
    expect(evaluate("![]")).toBe(true);
  });

  test("E17 identifiers come from env, own properties only", () => {
    expect(evaluate("a + b", { a: 2, b: 3 })).toBe(5);
    runtimeAt("1 + toString", 1, 5);
    runtimeAt("x +\n  nope", 2, 3, { x: 1 });
  });

  test("E17 env shadows builtins; parameters shadow env", () => {
    expect(evaluate("len", { len: 5 })).toBe(5);
    expect(evaluate("map([1], x => x + 1)", { x: 100 })).toEqual([2]);
  });

  test("E17 undefined from env is null", () => {
    expect(evaluate("a", { a: undefined })).toBe(null);
    expect(evaluate("o.k == null", { o: { k: undefined } })).toBe(true);
  });

  test("E29 lambdas close over enclosing parameters", () => {
    expect(evaluate("map([1, 2], x => map([10, 20], y => x + y))")).toEqual([
      [11, 21],
      [12, 22],
    ]);
  });
});

describe("operators", () => {
  test("E19 + on strings and arrays", () => {
    expect(evaluate("'ab' + 'cd'")).toBe("abcd");
    expect(evaluate("[1] + [2, 3]")).toEqual([1, 2, 3]);
  });

  test("E19 string + number is a runtime error at the +", () => {
    runtimeAt("'a' + 1", 1, 5);
    runtimeAt("1 + '1'", 1, 3);
    runtimeAt("[1] + 1", 1, 5);
    runtimeAt("null + null", 1, 6);
  });

  test("E20 division and remainder by zero", () => {
    runtimeAt("1 / 0", 1, 3);
    runtimeAt("5 % 0", 1, 3);
    runtimeAt("1 + 2 / (3 - 3)", 1, 7);
  });

  test("E20 remainder has the sign of the dividend", () => {
    expect(evaluate("-7 % 3")).toBe(-1);
    expect(evaluate("7 % -3")).toBe(1);
    expect(evaluate("7.5 % 2")).toBe(1.5);
  });

  test("E20 non-finite results are errors at the operator", () => {
    runtimeAt("10 ** 400", 1, 4);
    runtimeAt("(-8) ** 0.5", 1, 6);
    runtimeAt("1e308 * 10", 1, 7);
    runtimeAt("1e308 + 1e308", 1, 7);
  });

  test("E20 arithmetic needs numbers", () => {
    runtimeAt("'a' * 2", 1, 5);
    runtimeAt("true - 1", 1, 6);
  });

  test("E21 unary minus needs a number", () => {
    runtimeAt("1 + -'a'", 1, 5);
    runtimeAt("-null", 1, 1);
  });

  test("E22 equality never coerces", () => {
    expect(evaluate("1 == '1'")).toBe(false);
    expect(evaluate("null == false")).toBe(false);
    expect(evaluate("0 == false")).toBe(false);
    expect(evaluate("'' != null")).toBe(true);
  });

  test("E22 deep equality for arrays and objects", () => {
    expect(evaluate("[1, [2, 'x']] == [1, [2, 'x']]")).toBe(true);
    expect(evaluate("[1, 2] == [2, 1]")).toBe(false);
    expect(evaluate("a == b", { a: { x: 1, y: [1] }, b: { y: [1], x: 1 } })).toBe(true);
    expect(evaluate("a == b", { a: { x: 1 }, b: { x: 1, y: 2 } })).toBe(false);
    expect(evaluate("a != b", { a: { x: null }, b: {} })).toBe(true);
  });

  test("E22 functions are equal only to themselves", () => {
    expect(evaluate("len == len")).toBe(true);
    expect(evaluate("(x => x) == (x => x)")).toBe(false);
  });

  test("E23 comparisons on numbers and strings", () => {
    expect(evaluate("2 <= 2")).toBe(true);
    expect(evaluate("'B' < 'a'")).toBe(true);
    expect(evaluate("'abc' > 'abd'")).toBe(false);
  });

  test("E23 comparing other types is a runtime error", () => {
    runtimeAt("1 < 2 < 3", 1, 7);
    runtimeAt("1 < '2'", 1, 3);
    runtimeAt("null >= 0", 1, 6);
    runtimeAt("[1] < [2]", 1, 5);
  });

  test("E24 && and || return operands", () => {
    expect(evaluate("0 || 'x'")).toBe("x");
    expect(evaluate("[] || [1]")).toEqual([1]);
    expect(evaluate("'a' && 'b'")).toBe("b");
    expect(evaluate("'' && 'b'")).toBe("");
    expect(evaluate("[] && 1")).toEqual([]);
    expect(evaluate("null || 0")).toBe(0);
  });

  test("E24 E25 short-circuit skips errors", () => {
    expect(evaluate("false && 1 / 0")).toBe(false);
    expect(evaluate("1 || nope")).toBe(1);
    expect(evaluate("true ? 1 : 1 / 0")).toBe(1);
    expect(evaluate("[] ? nope : 2")).toBe(2);
    runtimeAt("true && 1 / 0", 1, 11);
  });

  test("E26 'in' over arrays, strings and objects", () => {
    expect(evaluate("[1, 2] in [[1, 2], 3]")).toBe(true);
    expect(evaluate("'1' in [1, 2]")).toBe(false);
    expect(evaluate("'' in 'abc'")).toBe(true);
    expect(evaluate("'k' in o", { o: { k: null } })).toBe(true);
    expect(evaluate("'toString' in o", { o: {} })).toBe(false);
  });

  test("E26 'in' type errors are at the keyword", () => {
    runtimeAt("1 in 'abc'", 1, 3);
    runtimeAt("1 in o", 1, 3, { o: { "1": true } });
    runtimeAt("'a' in null", 1, 5);
    runtimeAt("'a' in 5", 1, 5);
  });
});

describe("member access and indexing", () => {
  const env = { user: { name: "Ann", tags: ["a", "b", "c"], "first name": "A" }, s: "héllo", n: 5 };

  test("E27 member access and bracket keys", () => {
    expect(evaluate("user.name", env)).toBe("Ann");
    expect(evaluate("user['first name']", env)).toBe("A");
    expect(evaluate("user.tags[1]", env)).toBe("b");
  });

  test("E27 missing and inherited keys are null", () => {
    expect(evaluate("user.age", env)).toBe(null);
    expect(evaluate("user.toString", env)).toBe(null);
    expect(evaluate("user['constructor']", env)).toBe(null);
  });

  test("E27 member access on a non-object is an error at the '.'", () => {
    runtimeAt("user.age.x", 1, 9, env);
    runtimeAt("n.x", 1, 2, env);
    runtimeAt("user.tags.length", 1, 10, env);
    runtimeAt("user[1]", 1, 5, env);
  });

  test("E28 negative indexes count from the end; out of range is null", () => {
    expect(evaluate("user.tags[-1]", env)).toBe("c");
    expect(evaluate("user.tags[-3]", env)).toBe("a");
    expect(evaluate("user.tags[-4]", env)).toBe(null);
    expect(evaluate("user.tags[3]", env)).toBe(null);
    expect(evaluate("[][0]")).toBe(null);
  });

  test("E28 strings index by code unit", () => {
    expect(evaluate("s[1]", env)).toBe("é");
    expect(evaluate("s[-1]", env)).toBe("o");
    expect(evaluate("'😀'[0]")).toBe("\ud83d");
    expect(evaluate("s[10]", env)).toBe(null);
  });

  test("E28 index errors are at the '['", () => {
    runtimeAt("user.tags[1.5]", 1, 10, env);
    runtimeAt("user.tags['0']", 1, 10, env);
    runtimeAt("n[0]", 1, 2, env);
    runtimeAt("null[0]", 1, 5);
  });

  test("E29 calling a non-function is an error at the '('", () => {
    runtimeAt("n(1)", 1, 2, env);
    runtimeAt("user.name()", 1, 10, env);
  });

  test("E29 E18 arguments are evaluated before the callee is checked", () => {
    runtimeAt("n(1 / 0)", 1, 5, env);
  });

  test("E29 lambda arity mismatch is an error at the '('", () => {
    runtimeAt("(x => x)(1, 2)", 1, 9);
    runtimeAt("((a, b) => a)\n(1)", 2, 1);
  });
});

describe("builtins", () => {
  test("E31 len counts code units, array elements and keys", () => {
    expect(evaluate("len('😀')")).toBe(2);
    expect(evaluate("len([1, [2, 3]])")).toBe(2);
    expect(evaluate("len(o)", { o: { a: 1, b: 2 } })).toBe(2);
    runtimeAt("len(5)", 1, 4);
  });

  test("E31 upper and lower", () => {
    expect(evaluate("upper('abc') + lower('DéF')")).toBe("ABCdéf");
    runtimeAt("1 + upper(1)", 1, 10);
  });

  test("E31 keys are sorted, not in insertion order", () => {
    expect(evaluate("keys(o)", { o: { b: 1, a: 2, B: 3, _: 4 } })).toEqual(["B", "_", "a", "b"]);
    expect(evaluate("keys(o)", { o: { "10": 1, "9": 2, x: 3 } })).toEqual(["10", "9", "x"]);
  });

  test("E31 sum", () => {
    expect(evaluate("sum([1, 2, 3.5])")).toBe(6.5);
    expect(evaluate("sum([])")).toBe(0);
    runtimeAt("sum([1, '2'])", 1, 4);
    runtimeAt("sum(1)", 1, 4);
  });

  test("E32 map and filter", () => {
    expect(evaluate("filter([1, 2, 3, 4], x => x % 2 == 0)")).toEqual([2, 4]);
    expect(evaluate("filter([[], [1], 0, '', 'a', null], x => x)")).toEqual([[1], "a"]);
    expect(evaluate("map(['a', 'b'], upper)")).toEqual(["A", "B"]);
    expect(evaluate("sum(map(xs, x => x.n))", { xs: [{ n: 1 }, { n: 2 }] })).toBe(3);
  });

  test("E30 a callback's arity error is at the builtin's '('", () => {
    runtimeAt("map([1], (a, b) => a)", 1, 4);
    runtimeAt("1 +\n filter([1], () => 1)", 2, 8);
  });

  test("E30 an error inside a lambda body keeps its own position", () => {
    runtimeAt("map([1, 0], x => 1 / x)", 1, 20);
  });

  test("E30 map/filter argument types", () => {
    runtimeAt("map(1, x => x)", 1, 4);
    runtimeAt("filter([1], 2)", 1, 7);
    runtimeAt("map(upper, [1])", 1, 4);
  });

  test("E33 round half to even at 0 places", () => {
    expect(evaluate("round(2.5)")).toBe(2);
    expect(evaluate("round(3.5)")).toBe(4);
    expect(evaluate("round(-2.5)")).toBe(-2);
    expect(evaluate("round(-3.5)")).toBe(-4);
    expect(evaluate("round(2.4999)")).toBe(2);
    expect(evaluate("round(0.5)")).toBe(0);
  });

  test("E33 round at decimal places uses the decimal written by String(x)", () => {
    expect(evaluate("round(2.675, 2)")).toBe(2.68);
    expect(evaluate("round(2.665, 2)")).toBe(2.66);
    expect(evaluate("round(0.125, 2)")).toBe(0.12);
    expect(evaluate("round(0.375, 2)")).toBe(0.38);
    expect(evaluate("round(1.005, 2)")).toBe(1);
    expect(evaluate("round(1.0051, 2)")).toBe(1.01);
    expect(evaluate("round(123.456, 0)")).toBe(123);
    expect(evaluate("round(7, 3)")).toBe(7);
  });

  test("E33 round handles exponent notation and negative zero", () => {
    expect(evaluate("round(1.5e-7, 7)")).toBe(2e-7);
    expect(evaluate("round(2.5e-7, 7)")).toBe(2e-7);
    expect(Object.is(evaluate("round(-0.4)"), 0)).toBe(true);
    expect(evaluate("round(-1.25, 1)")).toBe(-1.2);
  });

  test("E33 E34 round's places must be an integer from 0 to 15", () => {
    runtimeAt("round(1.5, -1)", 1, 6);
    runtimeAt("round(1.5, 16)", 1, 6);
    runtimeAt("round(1.5, 0.5)", 1, 6);
    runtimeAt("round('1')", 1, 6);
  });

  test("E34 wrong argument counts", () => {
    runtimeAt("len()", 1, 4);
    runtimeAt("len('a', 'b')", 1, 4);
    runtimeAt("round(1, 2, 3)", 1, 6);
    runtimeAt("map([1])", 1, 4);
  });
});
