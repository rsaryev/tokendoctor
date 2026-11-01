// See README.md.
export class MoneyError extends Error {}
export function parseMoney(text: string): number { throw new Error("not implemented"); }
export function formatMoney(cents: number, currency: "USD" | "EUR" = "USD"): string { throw new Error("not implemented"); }
export function allocate(cents: number, ratios: number[]): number[] { throw new Error("not implemented"); }
