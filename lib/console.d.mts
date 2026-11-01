// Types for lib/console.mjs, as the hooks module uses it.
export type Finding = {
  id: string
  severity: string
  title: string
  fixes?: { scope?: string; ops?: { op: string; key: string; value?: unknown }[]; template?: string }[]
}
export type Entry = { name: string; key: string; values: string[]; range?: string; fallback?: unknown }
export type Parsed =
  | { action: 'overview'; scope: string }
  | { action: 'all'; scope: string }
  | { action: 'undo'; n: string | undefined }
  | { action: 'fix'; id: string | undefined; scope: string | undefined }
  | { action: 'unknown'; name: string; scope: string }
  | { action: 'explain'; entry: Entry; scope: string }
  | { action: 'set'; entry: Entry; value: unknown; scope: string }
export type Suggestion = { text: string; description?: string }

export const NAMES: Record<string, Omit<Entry, 'name'>>
export const MAIN: string[]
export function resolve(name: string): Entry | null
export function every(): Entry[]
export function parse(args: string): Parsed
export function value(key: string, raw: string): unknown
export type Op = { op: 'set'; key: string; value: unknown } | { op: 'unset'; key: string }
export function op(entry: Entry, v: unknown): { op: Op } | { error: string }
export function live(key: string): boolean
export function current(merged: Record<string, unknown>, key: string): unknown
export function display(v: unknown): string
export function overview(merged: Record<string, unknown>, findings: Finding[], compactsAt?: number): string
export function all(merged: Record<string, unknown>, compactsAt?: number): string
export function explain(entry: Entry, merged: Record<string, unknown>, findings: Finding[], compactsAt?: number): string
export function complete(text: string, start: number, token: string, findings: Finding[]): Suggestion[]
export function unknown(name: string): string
export type Change = { key: string; before?: unknown; after?: unknown }
export type JournalEntry = { at: string; path: string; scope: string; changes: Change[]; backup: string | null }
export function nameOf(path: string): string
export function undoList(journal: JournalEntry[]): string
