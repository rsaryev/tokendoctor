export class MoneyError extends Error {}
export function parseMoney(text: string): number {
  const m = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) throw new MoneyError(`bad amount: ${text}`);
  const whole = Number(m[2].replaceAll(",", ""));
  const frac = Number((m[3] ?? "").padEnd(2, "0"));
  const c = whole * 100 + frac;
  return m[1] ? -c : c;
}
function group(n: string, sep: string) { return n.replace(/\B(?=(\d{3})+(?!\d))/g, sep); }
export function formatMoney(cents: number, currency: "USD" | "EUR" = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  const w = String(Math.floor(a / 100)), f = String(a % 100).padStart(2, "0");
  return currency === "USD" ? `${sign}$${group(w, ",")}.${f}` : `${sign}${group(w, ".")},${f} €`;
}
export function allocate(cents: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (!ratios.length || ratios.some((r) => r < 0) || sum <= 0) throw new MoneyError("bad ratios");
  const out = ratios.map((r) => Math.floor((cents * r) / sum));
  let left = cents - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % out.length) if (ratios[i] >= 0) { out[i]++; left--; }
  return out;
}
