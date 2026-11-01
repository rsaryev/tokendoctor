# shopkit

Six small modules in `src/`, each specified below. Every function is exported by name.
The tests in `test/` are the acceptance tests: they are fixed and must not be changed.

## `src/money.ts`

- `parseMoney(text: string): number`: an amount of money as integer cents. Accepts an optional
  leading `-`, digits with optional `,` thousands separators (groups of exactly three, e.g.
  `1,234,567`), and an optional fraction of one or two digits (`12.5` is 1250 cents). Surrounding
  whitespace is ignored. Anything else throws `MoneyError` (a class exported from the module,
  extending `Error`).
- `formatMoney(cents: number, currency: "USD" | "EUR" = "USD"): string`: two decimals,
  thousands separated by `,`. USD is `$1,234.50`, negative `-$1,234.50`. EUR is `1.234,50 €`
  (thousands `.`, decimals `,`, a space then `€`), negative `-1.234,50 €`.
- `allocate(cents: number, ratios: number[]): number[]`: splits an amount by ratios (non-negative,
  at least one positive) into integer cents that sum exactly to the amount. Each share is
  `floor(cents * ratio / sum)`; the remaining cents go one each to the shares with a positive
  ratio, in order from the first. Throws `MoneyError` on bad ratios.

## `src/cart.ts`

`class Cart` with:

- `add(sku: string, qty: number, unitCents: number)`: adds a line; adding a sku already in the
  cart adds to its quantity (its price stays the first one). `qty` must be a positive integer,
  else throws `CartError`.
- `remove(sku: string, qty?: number)`: removes `qty` (default: all). A line that reaches 0 is
  gone. Removing a sku not in the cart throws `CartError`.
- `lines(): { sku: string; qty: number; unitCents: number; totalCents: number }[]` in the order
  skus were first added.
- `subtotal(): number`: sum of line totals.
- `applyCode(code: string)`: codes are `PCT<n>` (n percent off the subtotal, 1 to 90) and
  `OFF<n>` (n whole currency units, i.e. n*100 cents, off; only when the subtotal is at least
  twice that amount, else throws `CartError`). Only one code at a time: a new one replaces the old.
  An unknown or malformed code throws `CartError`.
- `discount(): number`: cents off. Percent discounts round half up to a cent. Never more than
  the subtotal.
- `total(taxRatePercent = 0): number`: `(subtotal - discount)` plus tax on that amount, the tax
  rounded half up to a cent.

`class CartError extends Error`.

## `src/csv.ts`

`parseCsv(text: string): string[][]`, RFC 4180 style:

- fields separated by `,`, records by `\n` or `\r\n`; a final line break does not add a record;
- a field may be quoted with `"`; inside quotes, `""` is a quote, and `,` and line breaks are
  literal;
- an empty input is `[]`; an empty line inside the text is a record with one empty field `[""]`;
- a quote inside an unquoted field, or text after a closing quote other than a separator,
  or an unclosed quote throws `CsvError` whose `line` property is the 1-based line where the
  record with the problem starts.

`toCsv(rows: string[][]): string`: the inverse: fields quoted only when they contain `,`, `"`,
`\r` or `\n`; records joined by `\n` with no final line break.

## `src/router.ts`

`class Router<T>`:

- `add(pattern: string, value: T)`: patterns are paths of segments: static (`users`), a param
  (`:id`), or a final wildcard (`*rest`, which matches one or more remaining segments). Adding
  the same pattern twice throws `RouterError`.
- `match(path: string): { value: T; params: Record<string, string>; query: Record<string, string> } | null`.
  The path may carry a `?query` (`a=1&b=two`, values URI-decoded, `+` is a space, a key with no
  `=` is `""`, the last of a repeated key wins). Trailing slashes are ignored (`/users/` is
  `/users`), the root is `/`. Params are URI-decoded; a wildcard's value is the rest joined by `/`.
  When several patterns match, at each segment a static one beats a param, which beats a
  wildcard, compared from the first segment on.

`class RouterError extends Error`.

## `src/lru.ts`

`class Lru<K, V>(capacity: number, options?: { ttlMs?: number; now?: () => number; onEvict?: (key: K, value: V) => void })`:

- `capacity` is a positive integer, else throws `RangeError`;
- `get(key)` returns the value and makes it the most recent; `undefined` when absent or expired;
- `set(key, value)` inserts or replaces (and makes it the most recent); when over capacity the
  least recent entry is evicted, and `onEvict` called with it;
- `delete(key): boolean`; `size` (a getter) counts entries not expired;
- with `ttlMs`, an entry expires `ttlMs` after it was last set (a `get` does not refresh it);
  `now` is the clock (default `Date.now`). An expired entry is removed when seen, without
  `onEvict`.
- `keys(): K[]`: live keys from most to least recent.

## `src/semver.ts`

- `parse(v: string): { major: number; minor: number; patch: number; pre: (string | number)[] }`:
  `1.2.3`, `1.2.3-alpha.1` (numeric identifiers become numbers). A leading `v` is allowed. Build
  metadata (`+build.5`) is accepted and ignored. Anything else throws `SemverError`. Numbers have
  no leading zeros (`01.2.3` is an error).
- `compare(a: string, b: string): -1 | 0 | 1`: by major, minor, patch; a version with a
  prerelease is lower than the same without; prereleases compare identifier by identifier,
  numbers below strings, numbers numerically, strings lexically, a shorter list lower when it is
  a prefix.
- `satisfies(v: string, range: string): boolean`: a range is one or more comparator sets
  separated by `||`; a set is comparators separated by spaces, all of which must hold. A
  comparator is `>=1.2.3`, `>1.2.3`, `<=`, `<`, `=1.2.3` or a bare version (equal), `^1.2.3`
  (`>=1.2.3 <2.0.0`; `^0.2.3` is `<0.3.0`; `^0.0.3` is `<0.0.4`), `~1.2.3` (`>=1.2.3 <1.3.0`),
  or an x-range `1.2.x`/`1.x`/`*` (also `1.2`/`1`). A prerelease version satisfies a set only if
  some comparator of that set names a version with the same major.minor.patch and a prerelease.

`class SemverError extends Error`.
