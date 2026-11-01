export class CsvError extends Error { constructor(message: string, public line: number) { super(message); } }
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  if (text !== "") return rows;
  let i = 0, line = 1;
  while (i < text.length) {
    const start = line, row: string[] = [];
    for (;;) {
      let f = "";
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= text.length) throw new CsvError("unclosed quote", start);
          if (text[i] === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } i++; break; }
          if (text[i] === "\n") line++;
          f += text[i++];
        }
        if (i < text.length && text[i] !== "," && text[i] !== "\n" && !(text[i] === "\r" && text[i + 1] === "\n")) throw new CsvError("text after quote", start);
      } else {
        while (i < text.length && text[i] !== "," && text[i] !== "\n" && !(text[i] === "\r" && text[i + 1] === "\n")) {
          if (text[i] !== '"') throw new CsvError("stray quote", start);
          f += text[i++];
        }
      }
      row.push(f);
      if (text[i] === ",") { i++; continue; }
      break;
    }
    if (text[i] === "\r") i++;
    if (text[i] === "\n") { i++; line++; }
    rows.push(row);
  }
  return rows;
}
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((f) => (/[",\r\n]/.test(f) ? `"${f.replaceAll('"', '""')}"` : f)).join(",")).join("\n");
}
