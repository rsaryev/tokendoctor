import { describe, expect, test } from "bun:test";
import { MoneyError, allocate, formatMoney, parseMoney } from "../src/money";

describe("parseMoney", () => {
  test("whole and fractional", () => {
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("12.05")).toBe(1205);
    expect(parseMoney("0.99")).toBe(99);
  });
  test("separators, sign, whitespace", () => {
    expect(parseMoney("1,234,567.89")).toBe(123456789);
    expect(parseMoney("  -3.10 ")).toBe(-310);
    expect(parseMoney("999")).toBe(99900);
  });
  test("rejects malformed", () => {
    for (const bad of ["", "abc", "1.234", "12,34", "1,2345", ",123", "1.", ".5", "--1", "1 000", "+1", "1,234.5.6"]) {
      expect(() => parseMoney(bad)).toThrow(MoneyError);
    }
  });
  test("MoneyError is an Error", () => {
    expect(new MoneyError("x")).toBeInstanceOf(Error);
  });
});

describe("formatMoney", () => {
  test("USD", () => {
    expect(formatMoney(123450)).toBe("$1,234.50");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(-123450, "USD")).toBe("-$1,234.50");
    expect(formatMoney(100000000)).toBe("$1,000,000.00");
    expect(formatMoney(0)).toBe("$0.00");
  });
  test("EUR", () => {
    expect(formatMoney(123450, "EUR")).toBe("1.234,50 €");
    expect(formatMoney(-99, "EUR")).toBe("-0,99 €");
    expect(formatMoney(123456789, "EUR")).toBe("1.234.567,89 €");
  });
  test("round trip", () => {
    for (const c of [0, 1, 99, 100, 123456, -98765]) expect(parseMoney(formatMoney(c).replace("$", ""))).toBe(c);
  });
});

describe("allocate", () => {
  test("even and uneven", () => {
    expect(allocate(100, [1, 1])).toEqual([50, 50]);
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(5, [3, 7])).toEqual([2, 3]);
    expect(allocate(1, [0, 1, 1])).toEqual([0, 1, 0]);
  });
  test("sums exactly", () => {
    const parts = allocate(1001, [2, 3, 5, 7]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(parts).toEqual([118, 177, 294, 412]);
  });
  test("bad ratios", () => {
    expect(() => allocate(100, [])).toThrow(MoneyError);
    expect(() => allocate(100, [0, 0])).toThrow(MoneyError);
    expect(() => allocate(100, [1, -1])).toThrow(MoneyError);
  });
});
