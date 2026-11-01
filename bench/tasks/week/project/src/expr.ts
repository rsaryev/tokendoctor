// An expression language: lexer, Pratt parser, evaluator. See README.md, "expr".

export class ExprSyntaxError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(`${message} at ${line}:${col}`);
    this.name = "ExprSyntaxError";
    this.line = line;
    this.col = col;
  }
}

export class ExprRuntimeError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(`${message} at ${line}:${col}`);
    this.name = "ExprRuntimeError";
    this.line = line;
    this.col = col;
  }
}

export function evaluate(src: string, env: Record<string, unknown> = {}): unknown {
  throw new Error("not implemented");
}
