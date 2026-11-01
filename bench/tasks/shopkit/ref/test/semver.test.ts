import { describe, expect, test } from "bun:test";
import { SemverError, compare, parse, satisfies } from "../src/semver";

describe("parse", () => {
  test("versions", () => {
    expect(parse("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parse("v10.0.1-alpha.1+build.5")).toEqual({ major: 10, minor: 0, patch: 1, pre: ["alpha", 1] });
    expect(parse("0.0.0-rc.01a")).toEqual({ major: 0, minor: 0, patch: 0, pre: ["rc", "01a"] });
  });
  test("rejects", () => {
    for (const bad of ["1.2", "1.2.3.4", "01.2.3", "1.02.3", "a.b.c", "1.2.3-", "1.2.3-a..b", "", "1.2.3+"]) {
      expect(() => parse(bad)).toThrow(SemverError);
    }
  });
});

describe("compare", () => {
  test("ordering", () => {
    const sorted = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0"];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = 0; j < sorted.length; j++) {
        expect(compare(sorted[i], sorted[j])).toBe(i < j ? -1 : i > j ? 1 : 0);
      }
    }
  });
  test("build ignored", () => {
    expect(compare("1.0.0+a", "1.0.0+b")).toBe(0);
  });
});

describe("satisfies", () => {
  const cases: [string, string, boolean][] = [
    ["1.2.3", "^1.2.3", true],
    ["1.9.9", "^1.2.3", true],
    ["2.0.0", "^1.2.3", false],
    ["0.2.9", "^0.2.3", true],
    ["0.3.0", "^0.2.3", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true],
    ["1.3.0", "~1.2.3", false],
    ["1.2.0", ">=1.2.0 <1.3.0", true],
    ["1.3.0", ">=1.2.0 <1.3.0", false],
    ["3.1.0", "<2.0.0 || >=3.0.0", true],
    ["2.5.0", "<2.0.0 || >=3.0.0", false],
    ["1.2.7", "1.2.x", true],
    ["1.3.0", "1.2", false],
    ["1.9.0", "1.x", true],
    ["5.0.0", "*", true],
    ["1.2.3", "1.2.3", true],
    ["1.2.3", "=1.2.4", false],
    ["1.2.3", ">1.2.3", false],
    ["1.2.3", "<=1.2.3", true],
    ["1.2.4-beta", "^1.2.3", false],
    ["1.2.3-beta.2", ">=1.2.3-beta.1", true],
    ["1.2.3-alpha", ">=1.2.3-beta.1", false],
    ["1.2.4-beta", ">=1.2.3-beta.1", false],
    ["1.2.3-rc.1", ">=1.2.3-beta <1.3.0", true],
  ];
  for (const [v, range, want] of cases) {
    test(`${v} ${range}`, () => expect(satisfies(v, range)).toBe(want));
  }
});
