export class Lru<K, V> {
  private map = new Map<K, { v: V; at: number }>();
  private ttl?: number; private now: () => number; private onEvict?: (k: K, v: V) => void;
  constructor(private capacity: number, o: { ttlMs?: number; now?: () => number; onEvict?: (k: K, v: V) => void } = {}) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("capacity");
    this.ttl = o.ttlMs; this.now = o.now ?? Date.now; this.onEvict = o.onEvict;
  }
  private live(k: K) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (this.ttl !== undefined && this.now() - e.at >= this.ttl) { this.map.delete(k); return undefined; }
    return e;
  }
  get(k: K) { const e = this.live(k); if (!e) return undefined; this.map.delete(k); this.map.set(k, e); return e.v; }
  set(k: K, v: V) {
    this.map.delete(k); this.map.set(k, { v, at: this.now() });
    for (const key of [...this.map.keys()]) this.live(key);
    while (this.map.size >= this.capacity) { const [ek, ee] = this.map.entries().next().value!; this.map.delete(ek); this.onEvict?.(ek, ee.v); }
  }
  delete(k: K) { return this.live(k) !== undefined && this.map.delete(k); }
  get size() { return this.keys().length; }
  keys() { return [...this.map.keys()].filter((k) => this.live(k)).reverse(); }
}
