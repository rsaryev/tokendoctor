import { describe, expect, test } from "bun:test";
import { Lru } from "../src/lru";

describe("Lru", () => {
  test("capacity must be positive integer", () => {
    expect(() => new Lru(0)).toThrow(RangeError);
    expect(() => new Lru(1.5)).toThrow(RangeError);
  });
  test("evicts the least recent", () => {
    const evicted: [string, number][] = [];
    const c = new Lru<string, number>(2, { onEvict: (k, v) => evicted.push([k, v]) });
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(evicted).toEqual([["b", 2]]);
    expect(c.keys()).toEqual(["c", "a"]);
    expect(c.size).toBe(2);
  });
  test("set replaces and refreshes", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 10);
    c.set("c", 3);
    expect(c.keys()).toEqual(["c", "a"]);
    expect(c.get("a")).toBe(10);
  });
  test("delete", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1);
    expect(c.delete("a")).toBe(true);
    expect(c.delete("a")).toBe(false);
    expect(c.size).toBe(0);
  });
  test("ttl with a clock", () => {
    let t = 1000;
    const evicted: string[] = [];
    const c = new Lru<string, number>(3, { ttlMs: 100, now: () => t, onEvict: (k) => evicted.push(k) });
    c.set("a", 1);
    t = 1050;
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    t = 1100;
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(1);
    expect(c.keys()).toEqual(["b"]);
    t = 1149;
    expect(c.get("b")).toBe(2);
    t = 1150;
    expect(c.get("b")).toBeUndefined();
    expect(evicted).toEqual([]);
  });
  test("set refreshes ttl, get does not", () => {
    let t = 0;
    const c = new Lru<string, number>(2, { ttlMs: 10, now: () => t });
    c.set("a", 1);
    t = 9;
    c.get("a");
    c.set("b", 2);
    t = 10;
    expect(c.get("a")).toBeUndefined();
    c.set("b", 3);
    t = 19;
    expect(c.get("b")).toBe(3);
  });
});
