import { describe, expect, test } from "bun:test";
import { CsvError, parseCsv, toCsv } from "../src/csv";

function err(text: string): CsvError {
  try {
    parseCsv(text);
  } catch (e) {
    if (e instanceof CsvError) return e;
    throw e;
  }
  throw new Error("no CsvError");
}

describe("parseCsv", () => {
  test("plain", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
    expect(parseCsv("")).toEqual([]);
  });
  test("CRLF and empty fields", () => {
    expect(parseCsv("a,,c\r\n,,\r\n")).toEqual([["a", "", "c"], ["", "", ""]]);
  });
  test("empty line is a record", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], [""], ["b"]]);
  });
  test("quotes", () => {
    expect(parseCsv('"a,b","say ""hi""",c\n')).toEqual([["a,b", 'say "hi"', "c"]]);
    expect(parseCsv('"line\nbreak",x')).toEqual([["line\nbreak", "x"]]);
    expect(parseCsv('"",""')).toEqual([["", ""]]);
    expect(parseCsv('"crlf\r\ninside"\r\n')).toEqual([["crlf\r\ninside"]]);
  });
  test("errors carry the record's line", () => {
    expect(err('a,b"c\n').line).toBe(1);
    expect(err('ok\n"x"y\n').line).toBe(2);
    expect(err('ok\nok\n"multi\nline\nnever closed').line).toBe(3);
    expect(err('"a\nb"c').line).toBe(1);
  });
});

describe("toCsv", () => {
  test("quotes only when needed", () => {
    expect(toCsv([["a", "b c", "d,e"], ['q"q', "x\ny", ""]])).toBe('a,b c,"d,e"\n"q""q","x\ny",');
    expect(toCsv([])).toBe("");
  });
  test("round trip", () => {
    const rows = [["id", "note"], ["1", 'he said "no", twice'], ["2", "multi\r\nline"], ["3", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
