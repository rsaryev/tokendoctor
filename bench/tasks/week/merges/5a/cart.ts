export class CartError extends Error {}
type Line = { sku: string; qty: number; unitCents: number };
const half = (x: number) => Math.floor(x + 0.5);
export class Cart {
  private items = new Map<string, Line>();
  private code: { pct?: number; off?: number } | null = null;
  add(sku: string, qty: number, unitCents: number) {
    if (!Number.isInteger(qty) || qty < 0) throw new CartError("bad qty");
    const l = this.items.get(sku);
    if (l) l.qty += qty; else this.items.set(sku, { sku, qty, unitCents });
  }
  remove(sku: string, qty?: number) {
    const l = this.items.get(sku);
    if (!l) throw new CartError("no such sku");
    l.qty -= qty ?? l.qty;
    if (l.qty <= 0) this.items.delete(sku);
  }
  lines() { return [...this.items.values()].map((l) => ({ ...l, totalCents: l.qty * l.unitCents })); }
  subtotal() { return this.lines().reduce((a, l) => a + l.totalCents, 0); }
  applyCode(code: string) {
    let m = /^PCT([1-9]\d*)$/.exec(code);
    if (m) { const n = Number(m[1]); if (n > 90) throw new CartError("bad"); this.code = { pct: n }; return; }
    m = /^OFF([1-9]\d*)$/.exec(code);
    if (m) { const off = Number(m[1]) * 100; if (this.subtotal() < 2 * off) throw new CartError("too small"); this.code = { off }; return; }
    throw new CartError("unknown code");
  }
  discount() {
    const s = this.subtotal();
    if (!this.code) return 0;
    const d = this.code.pct !== undefined ? half((s * this.code.pct) / 100) : this.code.off!;
    return Math.min(d, s);
  }
  total(taxRatePercent = 0) {
    const base = this.subtotal() - this.discount();
    return base + half((base * taxRatePercent) / 100);
  }
}
