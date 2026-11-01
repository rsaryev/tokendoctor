import { describe, expect, test } from "bun:test";
import { applyPatch, diffLines, PatchError, unifiedDiff } from "../src/diff";

// "kX" keep X, "dX" delete X, "iX" insert X.
const short = (a: string[], b: string[]) => diffLines(a, b).map((e) => e.op[0]! + e.line);
const chars = (s: string) => (s === "" ? [] : s.split(""));
const lines = (n: number, f: (i: number) => string = String) =>
  Array.from({ length: n }, (_, i) => `${f(i + 1)}\n`).join("");
const H = "--- a\n+++ b\n";

function patchFails(a: string, patch: string) {
  let err: unknown;
  try {
    applyPatch(a, patch);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(PatchError);
}

describe("diffLines", () => {
  test("D1 empty and identical inputs", () => {
    expect(diffLines([], [])).toEqual([]);
    expect(diffLines(["a"], [])).toEqual([{ op: "delete", line: "a" }]);
    expect(diffLines([], ["a"])).toEqual([{ op: "insert", line: "a" }]);
    expect(short(["a", "b"], ["a", "b"])).toEqual(["ka", "kb"]);
  });

  test("D1 lines compare with ===", () => {
    expect(short(["a ", "b"], ["a", "b"])).toEqual(["da ", "ia", "kb"]);
    expect(short([""], [""])).toEqual(["k"]);
  });

  test("D3 a swap deletes first", () => {
    expect(short(["a", "b"], ["b", "a"])).toEqual(["da", "kb", "ia"]);
  });

  test("D3 a changed region lists deletions before insertions", () => {
    expect(short(["a", "x", "c"], ["a", "y", "c"])).toEqual(["ka", "dx", "iy", "kc"]);
    expect(short(["x", "y"], ["p", "q"])).toEqual(["dx", "dy", "ip", "iq"]);
    expect(short(["1", "2", "3"], ["1", "X", "Y", "3"])).toEqual(["k1", "d2", "iX", "iY", "k3"]);
  });

  test("D3 the earliest equal line is the one kept", () => {
    expect(short(["a", "x", "a"], ["a"])).toEqual(["ka", "dx", "da"]);
    expect(short(["a"], ["a", "x", "a"])).toEqual(["ka", "ix", "ia"]);
    expect(short(["x", "a"], ["a", "a"])).toEqual(["dx", "ka", "ia"]);
  });

  test("D3 reversals", () => {
    expect(short(["a", "b", "c"], ["c", "b", "a"])).toEqual(["da", "db", "kc", "ib", "ia"]);
  });

  test("D3 the classic Myers example", () => {
    expect(short(chars("ABCABBA"), chars("CBABAC"))).toEqual(["dA", "dB", "kC", "dA", "kB", "iA", "kB", "kA", "iC"]);
  });

  test("D3 more ties", () => {
    expect(short(chars("abab"), chars("baba"))).toEqual(["da", "kb", "ka", "kb", "ia"]);
    expect(short(chars("aab"), chars("abb"))).toEqual(["ka", "da", "kb", "ib"]);
    expect(short(chars("xyz"), chars("zyx"))).toEqual(["dx", "dy", "kz", "iy", "ix"]);
    expect(short(chars("abcd"), chars("acbd"))).toEqual(["ka", "db", "kc", "ib", "kd"]);
  });

  test("D2 the script is minimal", () => {
    const a = chars("the quick brown fox");
    const b = chars("a quick brown dog");
    const edits = diffLines(a, b);
    const keeps = edits.filter((e) => e.op === "keep").length;
    expect(keeps).toBe(14);
    expect(edits.filter((e) => e.op !== "insert").map((e) => e.line)).toEqual(a);
    expect(edits.filter((e) => e.op !== "delete").map((e) => e.line)).toEqual(b);
  });

  test("D3 large inputs are fast and exact", () => {
    const a = Array.from({ length: 2000 }, (_, i) => `line ${i}`);
    const b = a.filter((_, i) => i % 100 !== 7).map((l, i) => (i % 250 === 3 ? `${l}!` : l));
    const edits = diffLines(a, b);
    expect(edits.filter((e) => e.op !== "insert").map((e) => e.line)).toEqual(a);
    expect(edits.filter((e) => e.op !== "delete").map((e) => e.line)).toEqual(b);
    expect(edits.filter((e) => e.op === "delete").length).toBe(28);
    expect(edits.filter((e) => e.op === "insert").length).toBe(8);
  });
  test("D1 inputs are not modified", () => {
    const a = ["x", "y", "z"];
    const b = ["y", "q"];
    diffLines(a, b);
    expect(a).toEqual(["x", "y", "z"]);
    expect(b).toEqual(["y", "q"]);
  });

  test("D3 a common line in the middle of a replaced block", () => {
    expect(short(chars("xmy"), chars("pmq"))).toEqual(["dx", "ip", "km", "dy", "iq"]);
    expect(short(chars("aXbXc"), chars("XX"))).toEqual(["da", "kX", "db", "kX", "dc"]);
  });
});

describe("unifiedDiff", () => {
  test("D5 equal inputs give the empty string", () => {
    expect(unifiedDiff("", "")).toBe("");
    expect(unifiedDiff("a\nb", "a\nb")).toBe("");
  });

  test("D5 D7 a one-line change with the default context", () => {
    expect(unifiedDiff("a\nb\nc\n", "a\nB\nc\n")).toBe(H + "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n");
  });

  test("D5 file names", () => {
    expect(unifiedDiff("x\n", "y\n", { fromFile: "old.txt", toFile: "new.txt" })).toBe(
      "--- old.txt\n+++ new.txt\n@@ -1 +1 @@\n-x\n+y\n",
    );
  });

  test("D7 empty sides show the line before", () => {
    expect(unifiedDiff("", "x\n")).toBe(H + "@@ -0,0 +1 @@\n+x\n");
    expect(unifiedDiff("x\n", "")).toBe(H + "@@ -1 +0,0 @@\n-x\n");
    expect(unifiedDiff("", "x\ny\n")).toBe(H + "@@ -0,0 +1,2 @@\n+x\n+y\n");
  });

  test("D7 context 0: pure insertions and deletions", () => {
    const a = lines(6);
    expect(unifiedDiff(a, a.replace("3\n", "3\nnew\n"), { context: 0 })).toBe(H + "@@ -3,0 +4 @@\n+new\n");
    expect(unifiedDiff(a, a.replace("4\n", ""), { context: 0 })).toBe(H + "@@ -4 +3,0 @@\n-4\n");
    expect(unifiedDiff(a, a.replace("5\n", "5x\n"), { context: 0 })).toBe(H + "@@ -5 +5 @@\n-5\n+5x\n");
  });

  test("D7 an insertion at the very start", () => {
    expect(unifiedDiff(lines(5), "0\n" + lines(5))).toBe(H + "@@ -1,3 +1,4 @@\n+0\n 1\n 2\n 3\n");
    expect(unifiedDiff("a\n", "top\na\n", { context: 0 })).toBe(H + "@@ -0,0 +1 @@\n+top\n");
  });

  test("D6 context is cut at the start and end of the file", () => {
    const a = lines(20);
    expect(unifiedDiff(a, a.replace(/^1\n/, "one\n"))).toBe(H + "@@ -1,4 +1,4 @@\n-1\n+one\n 2\n 3\n 4\n");
    expect(unifiedDiff(a, a.replace("20\n", "twenty\n"))).toBe(H + "@@ -17,4 +17,4 @@\n 17\n 18\n 19\n-20\n+twenty\n");
  });

  test("D6 a gap of exactly 2*context lines merges hunks", () => {
    const a = lines(20);
    const b = lines(20, (i) => (i === 5 || i === 12 ? `${i}x` : String(i)));
    expect(unifiedDiff(a, b)).toBe(
      H + "@@ -2,14 +2,14 @@\n 2\n 3\n 4\n-5\n+5x\n 6\n 7\n 8\n 9\n 10\n 11\n-12\n+12x\n 13\n 14\n 15\n",
    );
  });

  test("D6 a gap of 2*context+1 lines splits hunks", () => {
    const a = lines(20);
    const b = lines(20, (i) => (i === 5 || i === 13 ? `${i}x` : String(i)));
    expect(unifiedDiff(a, b)).toBe(
      H + "@@ -2,7 +2,7 @@\n 2\n 3\n 4\n-5\n+5x\n 6\n 7\n 8\n" + "@@ -10,7 +10,7 @@\n 10\n 11\n 12\n-13\n+13x\n 14\n 15\n 16\n",
    );
  });

  test("D6 the merge rule with context 1", () => {
    const a = lines(12);
    const mk = (x: number, y: number) => lines(12, (i) => (i === x || i === y ? `${i}x` : String(i)));
    expect(unifiedDiff(a, mk(5, 8), { context: 1 })).toBe(H + "@@ -4,6 +4,6 @@\n 4\n-5\n+5x\n 6\n 7\n-8\n+8x\n 9\n");
    expect(unifiedDiff(a, mk(5, 9), { context: 1 })).toBe(
      H + "@@ -4,3 +4,3 @@\n 4\n-5\n+5x\n 6\n@@ -8,3 +8,3 @@\n 8\n-9\n+9x\n 10\n",
    );
  });

  test("D6 hunk line counts differ on the two sides", () => {
    const a = lines(10);
    const b = a.replace("4\n5\n", "").replace("8\n", "8\n8a\n8b\n");
    expect(unifiedDiff(a, b)).toBe(H + "@@ -1,10 +1,10 @@\n 1\n 2\n 3\n-4\n-5\n 6\n 7\n 8\n+8a\n+8b\n 9\n 10\n");
  });

  test("D3 D7 the tie-break shows in the output", () => {
    expect(unifiedDiff("a\nb\n", "b\na\n")).toBe(H + "@@ -1,2 +1,2 @@\n-a\n b\n+a\n");
    expect(unifiedDiff("a\nb\n", "c\nd\n")).toBe(H + "@@ -1,2 +1,2 @@\n-a\n-b\n+c\n+d\n");
  });

  test("D4 D8 a missing newline at the end", () => {
    expect(unifiedDiff("x", "x\n")).toBe(H + "@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+x\n");
    expect(unifiedDiff("x\n", "x")).toBe(H + "@@ -1 +1 @@\n-x\n+x\n\\ No newline at end of file\n");
    expect(unifiedDiff("", "x")).toBe(H + "@@ -0,0 +1 @@\n+x\n\\ No newline at end of file\n");
  });

  test("D8 both sides without a newline", () => {
    expect(unifiedDiff("a\nb", "a\nc")).toBe(
      H + "@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n",
    );
  });

  test("D8 a kept last line without a newline is marked once", () => {
    expect(unifiedDiff("a\nz", "b\nz")).toBe(H + "@@ -1,2 +1,2 @@\n-a\n+b\n z\n\\ No newline at end of file\n");
  });

  test("D4 D8 appending after a last line that had no newline", () => {
    expect(unifiedDiff("a\nb", "a\nb\nc")).toBe(
      H + "@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n\\ No newline at end of file\n",
    );
  });

  test("D8 the marker is only for the file's last line", () => {
    const a = lines(10).slice(0, -1);
    expect(unifiedDiff(a, a.replace("2\n", "two\n"))).toBe(H + "@@ -1,5 +1,5 @@\n 1\n-2\n+two\n 3\n 4\n 5\n");
  });

  test("D4 \\r is content", () => {
    expect(unifiedDiff("a\r\nb\r\n", "a\r\nc\r\n")).toBe(H + "@@ -1,2 +1,2 @@\n a\r\n-b\r\n+c\r\n");
    expect(unifiedDiff("a\n", "a\r\n")).toBe(H + "@@ -1 +1 @@\n-a\n+a\r\n");
  });
  test("D6 context larger than the file", () => {
    expect(unifiedDiff("a\nb\nc\n", "a\nX\nc\n", { context: 10 })).toBe(H + "@@ -1,3 +1,3 @@\n a\n-b\n+X\n c\n");
  });

  test("D7 a deletion at the end of the file", () => {
    expect(unifiedDiff(lines(5), lines(4))).toBe(H + "@@ -2,4 +2,3 @@\n 2\n 3\n 4\n-5\n");
  });

  test("D6 three hunks", () => {
    const a = lines(30);
    const b = lines(30, (i) => (i === 2 || i === 15 || i === 29 ? `${i}x` : String(i)));
    const out = unifiedDiff(a, b, { context: 2 });
    expect(out.match(/^@@ .* @@$/gm)).toEqual(["@@ -1,4 +1,4 @@", "@@ -13,5 +13,5 @@", "@@ -27,4 +27,4 @@"]);
  });
});

describe("applyPatch", () => {
  const pairs: [string, string][] = [
    ["", ""],
    ["", "x\n"],
    ["x\n", ""],
    ["x", "x\n"],
    ["x\n", "x"],
    ["a\nb", "a\nc"],
    ["a\nb\nc\n", "c\nb\na\n"],
    [lines(30), lines(30, (i) => (i % 7 === 0 ? `${i}!` : String(i)))],
    [lines(30), lines(25).replace("12\n", "") + "tail"],
    ["only\n", "first\nonly\nlast"],
    [lines(10), ""],
    ["a\n\nb\n\n", "\n\na\nb\n"],
  ];

  test("D13 round trips with the default context", () => {
    for (const [a, b] of pairs) expect(applyPatch(a, unifiedDiff(a, b))).toBe(b);
  });

  test("D13 round trips with context 0 and 1", () => {
    for (const [a, b] of pairs) {
      expect(applyPatch(a, unifiedDiff(a, b, { context: 0 }))).toBe(b);
      expect(applyPatch(a, unifiedDiff(a, b, { context: 1 }))).toBe(b);
    }
  });

  test("D9 the empty patch and a patch with no hunk", () => {
    expect(applyPatch("abc", "")).toBe("abc");
    expect(applyPatch("abc\n", "--- x\n+++ y\n")).toBe("abc\n");
  });

  test("D9 headers are required", () => {
    patchFails("x\n", "@@ -1 +1 @@\n-x\n+y\n");
    patchFails("x\n", "+++ b\n--- a\n@@ -1 +1 @@\n-x\n+y\n");
  });

  test("D10 a hand-written patch with header text and no final newline", () => {
    expect(applyPatch("a\nb\nc\n", "--- f\n+++ f\n@@ -2 +2 @@ fn main()\n-b\n+B")).toBe("a\nB\nc\n");
  });

  test("D10 malformed lines", () => {
    patchFails("a\nb\n", H + "@@ -1,2 +1,2 @@\n a\n\n-b\n+c\n");
    patchFails("a\nb\n", H + "@@ -1,2 +1,2@@\n a\n-b\n+c\n");
    patchFails("a\nb\n", H + "@@ -1,2 +1,2 @@\n a\n*b\n+c\n");
    patchFails("a\n", H + "@@ -1 +1 @@\n\\ No newline at end of file\n-a\n+b\n");
    patchFails("a", H + "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n\\ No newline at end of file\n+b\n");
  });

  test("D11 counts must match the header", () => {
    patchFails("a\nb\n", H + "@@ -1,3 +1,2 @@\n a\n-b\n+c\n");
    patchFails("a\nb\n", H + "@@ -1,2 +1 @@\n a\n-b\n+c\n");
  });

  test("D11 the new start is not checked; old start 0 needs old length 0", () => {
    expect(applyPatch("x\n", H + "@@ -1 +99 @@\n-x\n+y\n")).toBe("y\n");
    patchFails("x\n", H + "@@ -0 +1 @@\n-x\n+y\n");
    expect(applyPatch("a\nb\n", H + "@@ -2,0 +3 @@\n+c\n")).toBe("a\nb\nc\n");
    expect(applyPatch("a\nb\n", H + "@@ -1,0 +2 @@\n+m\n")).toBe("a\nm\nb\n");
  });

  test("D12 no fuzz and no offset", () => {
    const a = lines(10);
    const p = unifiedDiff(a, a.replace("5\n", "five\n"));
    patchFails("0\n" + a, p);
    patchFails(a.replace("3\n", "three\n"), p);
  });

  test("D12 newline status must match", () => {
    patchFails("x", unifiedDiff("x\n", "y\n"));
    patchFails("x\n", unifiedDiff("x", "y"));
  });

  test("D12 hunks out of order, overlapping or past the end", () => {
    const a = lines(20);
    const b = lines(20, (i) => (i === 3 || i === 15 ? `${i}x` : String(i)));
    const [head, h1, h2] = unifiedDiff(a, b, { context: 0 }).split(/(?=^@@ )/m);
    expect(applyPatch(a, head! + h1! + h2!)).toBe(b);
    patchFails(a, head! + h2! + h1!);
    patchFails(a, head! + h1! + h1!);
    patchFails(lines(2), H + "@@ -5 +5 @@\n-5\n+6\n");
    patchFails(lines(2), H + "@@ -3,0 +3 @@\n+x\n");
  });

  test("D12 a line without a newline must end the result", () => {
    patchFails("a\nb\n", H + "@@ -1 +1,2 @@\n a\n+x\n\\ No newline at end of file\n");
  });
  test("D10 an explicit ,1 and a context line that starts with @@", () => {
    expect(applyPatch("@@ x\nb\n", H + "@@ -1,2 +1,2 @@\n @@ x\n-b\n+c\n")).toBe("@@ x\nc\n");
    expect(applyPatch("a\n", H + "@@ -1,1 +1,1 @@\n-a\n+b\n")).toBe("b\n");
  });

  test("D13 round trips with blank and whitespace-only lines", () => {
    const a = "\n \n\t\nx\n\n";
    const b = " \n\n\t\n\ny\n";
    expect(applyPatch(a, unifiedDiff(a, b))).toBe(b);
    expect(applyPatch(b, unifiedDiff(b, a, { context: 0 }))).toBe(a);
  });
});
