import { describe, expect, test } from "bun:test";
import { Cart, CartError } from "../src/cart";

function cart() {
  const c = new Cart();
  c.add("apple", 3, 120);
  c.add("pear", 1, 250);
  return c;
}

describe("lines", () => {
  test("add and merge", () => {
    const c = cart();
    c.add("apple", 2, 999);
    expect(c.lines()).toEqual([
      { sku: "apple", qty: 5, unitCents: 120, totalCents: 600 },
      { sku: "pear", qty: 1, unitCents: 250, totalCents: 250 },
    ]);
    expect(c.subtotal()).toBe(850);
  });
  test("bad quantity", () => {
    const c = new Cart();
    expect(() => c.add("x", 0, 1)).toThrow(CartError);
    expect(() => c.add("x", 1.5, 1)).toThrow(CartError);
    expect(() => c.add("x", -2, 1)).toThrow(CartError);
  });
  test("remove", () => {
    const c = cart();
    c.remove("apple", 1);
    expect(c.lines()[0].qty).toBe(2);
    c.remove("apple");
    expect(c.lines().map((l) => l.sku)).toEqual(["pear"]);
    c.remove("pear", 1);
    expect(c.lines()).toEqual([]);
    expect(() => c.remove("ghost")).toThrow(CartError);
  });
  test("order of first add survives re-add", () => {
    const c = cart();
    c.remove("apple");
    c.add("apple", 1, 120);
    expect(c.lines().map((l) => l.sku)).toEqual(["pear", "apple"]);
  });
});

describe("codes", () => {
  test("percent rounds half up", () => {
    const c = new Cart();
    c.add("a", 1, 1250);
    c.applyCode("PCT10");
    expect(c.discount()).toBe(125);
    c.add("b", 1, 5);
    expect(c.discount()).toBe(126);
    expect(c.total()).toBe(1129);
  });
  test("fixed needs twice the amount", () => {
    const c = cart();
    expect(() => c.applyCode("OFF4")).toThrow(CartError);
    c.applyCode("OFF3");
    expect(c.discount()).toBe(300);
  });
  test("a new code replaces the old", () => {
    const c = cart();
    c.applyCode("PCT50");
    c.applyCode("OFF1");
    expect(c.discount()).toBe(100);
  });
  test("malformed codes", () => {
    const c = cart();
    for (const bad of ["PCT0", "PCT91", "PCT", "pct10", "OFF", "OFFx", "FREE", "PCT1.5"]) {
      expect(() => c.applyCode(bad)).toThrow(CartError);
    }
  });
  test("discount never exceeds subtotal", () => {
    const c = cart();
    c.applyCode("OFF3");
    c.remove("apple");
    expect(c.discount()).toBe(250);
    expect(c.total()).toBe(0);
  });
  test("tax", () => {
    const c = cart();
    c.applyCode("PCT10");
    expect(c.discount()).toBe(61);
    expect(c.total(8.25)).toBe(594);
    expect(c.total()).toBe(549);
  });
});
