// Line diffs, unified diffs and patches. See README.md, "diff".

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

export type Edit = { op: "keep" | "delete" | "insert"; line: string };

export interface UnifiedOptions {
  context?: number;
  fromFile?: string;
  toFile?: string;
}

export function diffLines(a: string[], b: string[]): Edit[] {
  throw new Error("not implemented");
}

export function unifiedDiff(a: string, b: string, options: UnifiedOptions = {}): string {
  throw new Error("not implemented");
}

export function applyPatch(a: string, patch: string): string {
  throw new Error("not implemented");
}
