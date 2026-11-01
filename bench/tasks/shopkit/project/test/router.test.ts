import { describe, expect, test } from "bun:test";
import { Router, RouterError } from "../src/router";

function router() {
  const r = new Router<string>();
  r.add("/", "root");
  r.add("/users", "list");
  r.add("/users/:id", "user");
  r.add("/users/me", "me");
  r.add("/users/:id/posts/:post", "post");
  r.add("/files/*path", "files");
  r.add("/files/readme", "readme");
  r.add("/:section/about", "about");
  return r;
}

describe("match", () => {
  test("static, root, trailing slash", () => {
    const r = router();
    expect(r.match("/")?.value).toBe("root");
    expect(r.match("/users")?.value).toBe("list");
    expect(r.match("/users/")?.value).toBe("list");
    expect(r.match("/nothing")).toBeNull();
  });
  test("params", () => {
    const r = router();
    expect(r.match("/users/42")).toEqual({ value: "user", params: { id: "42" }, query: {} });
    expect(r.match("/users/7/posts/hello%20world")?.params).toEqual({ id: "7", post: "hello world" });
  });
  test("priority", () => {
    const r = router();
    expect(r.match("/users/me")?.value).toBe("me");
    expect(r.match("/files/readme")?.value).toBe("readme");
    expect(r.match("/users/about")).toEqual({ value: "user", params: { id: "about" }, query: {} });
    expect(r.match("/blog/about")).toEqual({ value: "about", params: { section: "blog" }, query: {} });
  });
  test("wildcard", () => {
    const r = router();
    expect(r.match("/files/a/b/c.txt")?.params).toEqual({ path: "a/b/c.txt" });
    expect(r.match("/files")).toBeNull();
  });
  test("query", () => {
    const r = router();
    expect(r.match("/users?page=2&q=a+b%21&flag&page=3")?.query).toEqual({ page: "3", q: "a b!", flag: "" });
    expect(r.match("/users/5?x=1")?.params).toEqual({ id: "5" });
  });
  test("duplicate pattern", () => {
    const r = router();
    expect(() => r.add("/users/:id", "again")).toThrow(RouterError);
  });
});
