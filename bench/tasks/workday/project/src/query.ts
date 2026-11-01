// A SQL-like query over arrays of plain objects. See README.md, "query".

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}

export type Scalar = number | string | boolean | null;
export type Row = Record<string, Scalar>;

export function query(sql: string, tables: Record<string, Row[]>): Row[] {
  throw new Error("not implemented");
}
