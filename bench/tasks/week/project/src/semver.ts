// See README.md.
export class SemverError extends Error {}
export function parse(v: string): { major: number; minor: number; patch: number; pre: (string | number)[] } { throw new Error("not implemented"); }
export function compare(a: string, b: string): -1 | 0 | 1 { throw new Error("not implemented"); }
export function satisfies(v: string, range: string): boolean { throw new Error("not implemented"); }
