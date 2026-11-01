# evalkit

Four small TypeScript libraries, specified exactly. Each `src/*.ts` file is a stub: its exports,
types and error classes are in place, and every function throws `new Error("not implemented")`.
Implement them so that `bun test` passes.

Rules for the work:

- Implement only the files in `src/`. Do not change the tests, `package.json` or `tsconfig.json`,
  and do not change the exported names, signatures or error classes.
- No dependencies: Bun's runtime and standard JavaScript only, no npm packages, no network.
- Everything the tests check is stated below, and each test's name starts with the ids of the
  rules it checks (`E10`, `Q14`, `D3`, `C8`, ...). Read the rules carefully: many of them differ
  on purpose from what a quick guess, or another tool's behaviour, would give.

Run `bun test` for everything, or `bun test test/expr.test.ts` for one module.

## 1. `src/expr.ts`: an expression language

```ts
export class ExprSyntaxError extends Error { line: number; col: number }
export class ExprRuntimeError extends Error { line: number; col: number }
export function evaluate(src: string, env?: Record<string, unknown>): unknown
```

`evaluate` lexes and parses the whole of `src` first, then evaluates it. A syntax error anywhere
in the source is thrown before anything is evaluated, so `unknownName + (1 +` is an
`ExprSyntaxError`, not a runtime error. The lexer turns the whole of `src` into tokens before the
parser looks at any of them, so a lexer error (E5-E8) anywhere wins over a parser error at an
earlier token: `) #` is an error at the `#` (1:3), not at the `)`, and `1 + * "abc` is an error
at the opening quote (1:7), not at the `*`.

### Positions and errors

- **E1** Every error carries `.line` and `.col`, both 1-based, of the token (or character) the
  rule below names. Lines are separated by `\n`. Columns count UTF-16 code units; a tab is one
  column, `\r` is one column.
- **E2** An error's `message` ends with ` at <line>:<col>` (for example
  `"division by zero at 1:3"`). What comes before that suffix is free.
- **E3** `ExprSyntaxError` is thrown for anything the lexer or parser rejects;
  `ExprRuntimeError` for anything evaluation rejects. Both classes are already defined in the stub
  (their constructor takes `(message, line, col)`); keep them.

### Lexing

- **E4** Whitespace is space, tab, `\r` and `\n`; it separates tokens and is otherwise ignored.
- **E5** Numbers: one or more digits, then optionally `.` followed by one or more digits, then
  optionally `e` or `E`, an optional `+` or `-`, and one or more digits. A `.` belongs to the
  number only when a digit follows it; an `e`/`E` belongs to it only when a digit, or a sign and
  a digit, follows it. So `1.` is the number `1` followed by a `.` token; `1e` is the number `1`
  followed by the identifier `e` (which is then a syntax error at the `e`: two operands in a
  row); `.5` starts with a `.` token (a syntax error at the `.`). Leading zeros are allowed
  (`007` is 7). The value is JavaScript's `Number(text)`.
- **E6** Strings are delimited by `"` or `'`, and end at the next unescaped quote of the same
  kind. Escapes: `\n`, `\t`, `\r`, `\\`, `\"`, `\'` (both quote escapes are valid in both kinds
  of string), and `\u{H}` with 1 to 6 hex digits (either case) naming a code point no greater
  than `10FFFF`. Any other escape, including a malformed `\u`, is an `ExprSyntaxError` at the
  backslash. A string may not contain a raw newline: a newline or the end of input before the
  closing quote (including right after a backslash) is an `ExprSyntaxError` at the opening
  quote. A string is read left to right and the first problem met is the one reported; an escape
  is checked whole as soon as its backslash is read. So `"\q` (never closed) is an error at the
  backslash (1:2), and so is `"a\u{41` (the input ends inside the braces: a malformed `\u`, at
  1:3), while `"ab\` (the input ends right after the backslash) and `"\u{41}` (a valid escape,
  then the end) are errors at the opening quote.
- **E7** Identifiers: a letter (ASCII `a-z`, `A-Z`) or `_`, then letters, digits or `_`. The
  words `true`, `false`, `null` and `in` are keywords, not identifiers.
- **E8** Operators and punctuation, longest match first: `**` `==` `!=` `<=` `>=` `&&` `||`
  `=>` `+` `-` `*` `/` `%` `<` `>` `!` `?` `:` `.` `,` `(` `)` `[` `]`. Any other character
  (including a lone `=`, `&` or `|`) is an `ExprSyntaxError` at that character.

### Grammar

- **E9** Precedence, from loosest to tightest:
  1. `c ? a : b`, right-associative (`a ? b : c ? d : e` is `a ? b : (c ? d : e)`); the middle
     operand is any expression; the condition is everything to the left at a looser level, so
     `a || b ? c : d` is `(a || b) ? c : d`;
  2. `||`; 3. `&&`; 4. `==` `!=`; 5. `<` `<=` `>` `>=` `in`; 6. `+` `-`; 7. `*` `/` `%`
     (levels 2 to 7 are left-associative);
  8. prefix `-` and `!` (they nest: `--2` is 2, `!!x`);
  9. `**`, right-associative (`2 ** 3 ** 2` is 512);
  10. postfix: member `a.b`, index `a[e]`, call `f(args)`, any number of them in a row.
- **E10** `**` as in JavaScript: its left operand cannot be a prefix `-`/`!` expression.
  `-2 ** 2`, `!x ** 2`, `-(2) ** 2` and `2 ** -2 ** 2` are `ExprSyntaxError` at the `**`.
  `(-2) ** 2` is 4 and `2 ** -2` is 0.25 (the right operand may be a prefix expression).
- **E11** Primaries: a number, a string, `true`, `false`, `null`, an identifier, a parenthesized
  expression, an array literal `[a, b, c]` (`[]` is empty; no trailing comma: `[1,]` is a syntax
  error at the `]`), or a lambda.
- **E12** After `.` comes an identifier (not a keyword: `a.null` is a syntax error at `null`).
  Call arguments are expressions separated by commas, no trailing comma (`f(1,)` is a syntax
  error at the `)`).
- **E13** Lambdas: `x => body`, `() => body`, `(a, b) => body`. A `(` starts a lambda exactly
  when it is followed by zero or more comma-separated identifiers, then `)`, then `=>`;
  otherwise it is a parenthesized expression (so `(a, b)` without `=>` is a syntax error at the
  `,`). The body is a whole expression, ternary included, and extends as far as it can
  (`map(xs, x => x > 1 ? 1 : 0)`). A repeated parameter name is a syntax error at its second
  occurrence.
- **E14** Syntax error positions: the first token that cannot continue a valid expression. At
  the end of input that position is the end-of-input position: just past the last character
  (for `1 +` it is 1:4; for `(1\n` it is 2:1; for the empty source it is 1:1).

### Values

- **E15** Values are numbers, strings, booleans, `null`, arrays, objects (plain objects from the
  environment) and functions (lambdas and builtins). Arrays and objects are returned to the
  caller as plain JavaScript arrays and objects. What a function value looks like when it is
  returned to the caller is free. The values in `env` are numbers, strings, booleans, `null`,
  `undefined`, arrays and plain objects, nested to any depth; any other JavaScript value there
  (a JavaScript function, a `Date`, a `Map`) is outside this specification, and no test passes
  one.
- **E16** Truthiness: `false`, `null`, `0`, `""` and the empty array `[]` are falsy. Everything
  else is truthy, including `{}` (an object with no keys) and `"0"`.
- **E17** Identifiers resolve, in order, to: a lambda parameter of an enclosing lambda (innermost
  first), an own property of `env` (`Object.hasOwn`; an inherited one such as `toString` is not
  found), a builtin. So an `env` key named `len` shadows the builtin. An unresolved identifier
  is an `ExprRuntimeError` at the identifier. A value of `undefined` read from the environment
  (at any depth) is `null`.

### Operators

- **E18** Operands are evaluated left to right, then checked. A runtime error raised by an
  operator is located at the operator token.
- **E19** `+`: two numbers add; two strings concatenate; two arrays concatenate into a new
  array. Anything else (including string + number) is an `ExprRuntimeError` at the `+`.
- **E20** `-` `*` `/` `%` `**` take two numbers, else an `ExprRuntimeError` at the operator.
  `/` and `%` with a right operand of `0` are an `ExprRuntimeError` ("division by zero") at the
  operator. `%` is JavaScript's remainder (`-7 % 3` is -1). An arithmetic result (of any of
  these, of `+`, or of `sum`) that is `NaN` or infinite is an `ExprRuntimeError` at the operator
  (`10 ** 400`, `(-8) ** 0.5`).
- **E21** Prefix `-` takes a number, else an `ExprRuntimeError` at the `-`. `!` takes any value
  and returns the boolean opposite of its truthiness.
- **E22** `==` and `!=` never coerce: values of different types are unequal (`1 == "1"` is
  false, `null == false` is false). Arrays are equal when they have the same length and equal
  elements in order; objects when they have the same set of own keys and equal values for each
  (key order does not matter); functions only when they are the same function.
- **E23** `<` `<=` `>` `>=` take two numbers or two strings (strings compare by UTF-16 code
  units, as JavaScript does). Anything else is an `ExprRuntimeError` at the operator; so
  `1 < 2 < 3` is an error at the second `<` (it compares `true` with `3`).
- **E24** `&&` and `||` short-circuit and return an operand, not a boolean: `a && b` is `a` when
  `a` is falsy, else `b`; `a || b` is `a` when `a` is truthy, else `b`. The operand not
  evaluated cannot raise an error (`false && 1 / 0` is `false`).
- **E25** `c ? a : b` evaluates `c`, then only the chosen branch.
- **E26** `x in y`: when `y` is an array, whether some element equals `x` (by E22); when `y` is
  a string, `x` must be a string and the result is whether it is a substring; when `y` is an
  object, `x` must be a string and the result is whether it is an own key. Anything else is an
  `ExprRuntimeError` at the `in`.
- **E27** Member access `o.name` and `o["name"]`: `o` must be an object, else an
  `ExprRuntimeError` at the `.` (or the `[`). An own key yields its value; a missing key, or an
  inherited one (`o.toString`), yields `null`. With `[`, the key must be a string, else an
  `ExprRuntimeError` at the `[`.
- **E28** Indexing `a[i]` on an array or a string: `i` must be an integer number, else an
  `ExprRuntimeError` at the `[`. A negative `i` counts from the end (`-1` is the last element).
  An index out of range (either way) yields `null`. A string's element is a one-code-unit
  string. Indexing any other value (number, boolean, `null`, function) is an `ExprRuntimeError`
  at the `[`.
- **E29** A call `f(args)` evaluates `f`, then the arguments left to right, then requires `f` to
  be a function (else an `ExprRuntimeError` at the `(`). A lambda called with a number of
  arguments other than its number of parameters is an `ExprRuntimeError` at the `(`. Lambdas
  close over the parameters of the lambdas they are written in.

### Builtins

- **E30** Errors raised by a builtin (a wrong number of arguments, an argument of the wrong type)
  are located at the `(` of the call that invoked it. When `map` or `filter` invoke a function,
  that is the `(` of the `map`/`filter` call: so `map([1], (a, b) => a)` is an
  `ExprRuntimeError` at the `(` after `map`. An error inside a lambda's body keeps its own
  position. Builtins are values: `map(["a"], upper)` is `["A"]`.
- **E31** `len(x)`: the length of a string (in UTF-16 code units: `len("😀")` is 2) or an
  array, or the number of own keys of an object. `upper(s)`, `lower(s)`: JavaScript's
  `toUpperCase`/`toLowerCase` of a string. `keys(o)`: the own keys of an object, sorted by
  UTF-16 code units (JavaScript's default `sort`), not in insertion order. `sum(xs)`: the sum,
  left to right, of an array of numbers (`sum([])` is 0; any non-number element is an error).
- **E32** `map(xs, f)` and `filter(xs, f)`: `xs` an array and `f` a function, called once per
  element, in order, with exactly one argument, the element. `filter` keeps the elements for
  which `f` returns a truthy value (E16).
- **E33** `round(x)` and `round(x, places)`: `places` is an integer from 0 to 15 (default 0),
  else an error. The result is the multiple of 10^-places nearest to `x`, where `x` is taken as
  the exact decimal number that `String(x)` writes (so `2.675` is two thousand six hundred
  seventy-five thousandths, not its binary approximation). A tie goes to the candidate whose last
  digit is even (banker's rounding): `round(2.5)` is 2, `round(3.5)` is 4, `round(-2.5)` is -2,
  `round(2.675, 2)` is 2.68, `round(2.665, 2)` is 2.66, `round(0.125, 2)` is 0.12. A result of
  negative zero is returned as `0`.
- **E34** Each builtin takes exactly the number of arguments shown (`round` one or two); any
  other number is an `ExprRuntimeError` at the `(`.

## 2. `src/query.ts`: SQL over arrays of objects

```ts
export class QueryError extends Error {}
export type Scalar = number | string | boolean | null;
export type Row = Record<string, Scalar>;
export function query(sql: string, tables: Record<string, Row[]>): Row[]
```

Every rejected query, for any reason (lexing, syntax, unknown names, types), throws a
`QueryError` and nothing else.

### Lexing

- **Q1** Keywords are case-insensitive (`select`, `Select`). The reserved words are `SELECT`
  `DISTINCT` `FROM` `AS` `WHERE` `GROUP` `BY` `HAVING` `ORDER` `ASC` `DESC` `LIMIT` `OFFSET` `AND`
  `OR` `NOT` `IN` `BETWEEN` `LIKE` `IS` `NULL` `TRUE` `FALSE` `COUNT` `SUM` `AVG` `MIN` `MAX`; a
  word that is one of them in any case is that keyword and can never be an identifier.
- **Q2** Identifiers are `[A-Za-z_][A-Za-z0-9_]*` and case-sensitive: `Name` and `name` are
  different columns.
- **Q3** Numbers are digits with an optional `.` and digits (`3`, `2.5`; no exponent; a minus sign
  is the unary operator). Strings are in single quotes; a doubled quote `''` inside one is a
  quote (`'O''Hare'`). An unterminated string, or any character outside the grammar (a double
  quote, `;`, `!` not followed by `=`, ...), is a `QueryError`. Whitespace is space, tab, `\n` and
  `\r`.

### Grammar

- **Q4** A query, with clauses in exactly this order and nothing after it:
  `SELECT [DISTINCT] <list> FROM <table> [[AS] <alias>] [WHERE e] [GROUP BY c {, c}] [HAVING e]
  [ORDER BY e [ASC|DESC] {, e [ASC|DESC]}] [LIMIT n] [OFFSET n]`. `<list>` is either a lone `*`
  or one or more `e [AS name]` separated by commas (an alias needs `AS`; `*` cannot be mixed with
  other items). `GROUP BY` takes column references only, written without parentheses
  (`GROUP BY (dept)` is a `QueryError`, unlike a parenthesized reference elsewhere: Q22, Q26).
  `n` is a non-negative integer literal;
  `OFFSET` may appear without `LIMIT`, but when both appear `LIMIT` comes first.
- **Q5** Expression precedence, loosest first: `OR`; `AND`; prefix `NOT`; a comparison;
  `+` `-`; `*` `/` `%`; prefix `-`; primaries. Binary operators are left-associative. A
  comparison is one of: `a = b`, `a <> b`, `a != b` (the same as `<>`), `a < b`, `a <= b`,
  `a > b`, `a >= b`, `a IS [NOT] NULL`, `a [NOT] IN (e {, e})`, `a [NOT] BETWEEN x AND y`,
  `a [NOT] LIKE p`. Their operands (`a`, `b`, `x`, `y`, `p`) are at the `+` level; the items of
  an `IN` list are any expressions. Comparisons do not chain:
  `a = b = c` is a `QueryError`. The `AND` of a `BETWEEN` belongs to it:
  `x BETWEEN 1 AND 3 AND y = 2` is `(x BETWEEN 1 AND 3) AND (y = 2)`.
- **Q6** Primaries: numbers, strings, `TRUE`, `FALSE`, `NULL`, a column reference `name` or
  `q.name`, a parenthesized expression, and the aggregates `COUNT(*)`, `COUNT(e)`,
  `COUNT(DISTINCT e)`, `SUM(e)`, `AVG(e)`, `MIN(e)`, `MAX(e)` (`DISTINCT` only inside `COUNT`).

### Tables and columns

- **Q7** `<table>` must be an own key of `tables` whose value is an array, else a `QueryError`
  whose message contains the table's name.
- **Q8** A table's columns are the union of the own keys of all its rows, in order of first
  appearance (the first row's keys in its order, then each new key of the second row, and so
  on). A column reference naming anything else is a `QueryError` whose message contains the
  name. This is checked for every reference in the query before any row is read, so it fails
  even when no row would reach it (`WHERE FALSE AND nope = 1`) and for every reference into an
  empty table (an empty table has no columns).
- **Q9** Inside a row, a column the row has no key for, or whose value is `undefined`, is `NULL`.
- **Q10** A qualified reference `q.name` requires `q` to be the alias when the table has one, and
  the table's name when it does not (with an alias, the table's own name is no longer valid);
  anything else is a `QueryError`.

### Values, NULL and three-valued logic

- **Q11** Comparisons with a `NULL` operand are `NULL`. `=` and `<>` between two non-`NULL`
  values of different types (number, string, boolean) are `FALSE` and `TRUE`; `<` `<=` `>`
  `>=` between them are a `QueryError`. Strings order by UTF-16 code units; `FALSE < TRUE`.
- **Q12** `AND`, `OR`, `NOT` use SQL's three-valued logic (`FALSE AND NULL` is `FALSE`,
  `TRUE OR NULL` is `TRUE`, `NOT NULL` is `NULL`, otherwise any `NULL` operand gives `NULL`).
  Both operands of `AND` and `OR` are always evaluated. The operands of `AND`, `OR` and `NOT`
  must be booleans or `NULL`, else a `QueryError`.
- **Q13** `a IS NULL` and `a IS NOT NULL` are never `NULL`.
- **Q14** `a IN (l1, ..., ln)` is `TRUE` when some `a = li` is `TRUE`; otherwise `NULL` when any
  `a = li` is `NULL` (in particular when `a` is `NULL`); otherwise `FALSE`. `a NOT IN (...)` is
  `NOT (a IN (...))`, so `3 NOT IN (1, NULL)` is `NULL`.
- **Q15** `a BETWEEN x AND y` is `a >= x AND a <= y` (inclusive, three-valued); `NOT BETWEEN`
  is its `NOT`.
- **Q16** `a LIKE p`: `NULL` when either is `NULL`, whatever the other is (`NULL LIKE 1` is
  `NULL`); otherwise a `QueryError` when either is not a string.
  Otherwise whether `p` matches the whole of `a`, where `%` matches any sequence of characters
  (including none), `_` exactly one UTF-16 code unit, and every other character only itself
  (case-sensitive; there is no escape character; regular-expression characters such as `.` or
  `*` are literal). `NOT LIKE` is its `NOT`.
- **Q17** Arithmetic (`+` `-` `*` `/` `%`) takes numbers, checked in this order: a `NULL`
  operand gives `NULL`, whatever the other operand is (`NULL + 'a'` and `TRUE * NULL` are
  `NULL`); otherwise a non-number operand is a `QueryError`; otherwise `/` and `%` by zero give
  `NULL` (so `'a' / 0` is a `QueryError`). `/` is exact division (`7 / 2` is `3.5`); `%` is
  JavaScript's remainder. Prefix `-` of `NULL` is `NULL`; of any other non-number, a
  `QueryError`.
- **Q18** `WHERE` and `HAVING` keep a row (a group) only when their condition is `TRUE`; `FALSE`
  and `NULL` drop it. A condition that is not a boolean or `NULL` is a `QueryError`.

### Grouping and aggregates

- **Q19** A query is grouped when it has `GROUP BY`, or `HAVING`, or an aggregate anywhere in
  its select list or in an `ORDER BY` expression. A grouped query without `GROUP BY` has exactly
  one group, holding every row that passed `WHERE`, even when there are none (so
  `SELECT COUNT(*) FROM t WHERE FALSE` returns one row). With `GROUP BY`, groups are formed by
  equal key values (`NULL` equal to `NULL`; `1` and `'1'` differ), one output row per group, in
  the order each group's first row appears; no rows give no groups.
- **Q20** In a grouped query, every column reference in the select list, `HAVING` and `ORDER BY`
  that is outside an aggregate must name a `GROUP BY` column, else a `QueryError` whose message
  contains that column's name. `SELECT *` in
  a grouped query is a `QueryError`. An aggregate inside an aggregate, or any aggregate in
  `WHERE`, is a `QueryError`.
- **Q21** `COUNT(*)` counts the group's rows. `COUNT(e)` counts the rows where `e` is not
  `NULL`; `COUNT(DISTINCT e)` counts the distinct non-`NULL` values (equal when of the same type
  and value). `SUM`, `AVG`, `MIN` and `MAX` ignore `NULL`s and are `NULL` when no non-`NULL`
  value is left (an empty group too). `SUM` and `AVG` require numbers (`QueryError` otherwise);
  `SUM` adds in row order and `AVG` is that sum divided by the count of non-`NULL` values.
  `MIN`/`MAX` take numbers, strings or booleans, all of one type (`QueryError` otherwise).

### Output

- **Q22** Each output row is a new object with one key per select-list item, in select-list
  order. The key is the item's alias when it has one; else, for a column reference (qualified or
  not), the column's name; else the item's exact source text, from its first character to its
  last, as written (`count(*)`, `SUM( salary )`, `salary * 2`, `(salary + 1) * 2`). A column
  reference in parentheses, such as `(id)`, is still a column reference (its key is `id`). Two
  items with the same key are a `QueryError`.
- **Q23** `SELECT *` outputs every column of the table (Q8), in that order; a row missing one
  gets `null` for it.
- **Q24** Without `ORDER BY`, rows come out in table order (groups in the order of Q19).
- **Q25** `DISTINCT` drops every output row equal to an earlier one (same values, by type and
  value, `NULL` equal to `NULL`), keeping the first.
- **Q26** `ORDER BY` items are resolved, in this order: an integer literal `k` is the `k`-th
  output column (1-based; out of range, or a non-integer number, is a `QueryError`); a bare
  identifier equal to an output column's key is that output column (even when the table also
  has a column of that name: `SELECT b AS a FROM t ORDER BY a` sorts by `b`); anything else is
  an expression over the source row (or, in a grouped query, over the group). With `DISTINCT`,
  only the first two kinds are allowed (a `QueryError` otherwise). Parentheses do not change an
  item's kind, as in Q22: `(2)` and `((2))` are the second output column, and `(n)` is a bare
  identifier. An integer literal is a number literal written without a `.`; one written with it
  (`2.0`, `1.5`) is a `QueryError`. `-1` is not a literal but an expression (Q3), a constant that
  leaves the order as it was, and so a `QueryError` with `DISTINCT`.
- **Q27** Sorting compares the first key, then the next on a tie, and so on; rows equal on every
  key keep their relative order (stable). `ASC` is the default. `NULL` sorts before every value
  ascending and after every value descending. Non-`NULL` values of one key must all be of one
  type across the rows being sorted, else a `QueryError` (even for rows a `LIMIT` would drop).
- **Q28** The order of work: `WHERE`, grouping, `HAVING`, the select list, `DISTINCT`,
  `ORDER BY`, then `OFFSET` (skip that many rows) and `LIMIT` (keep at most that many).

## 3. `src/diff.ts`: line diffs, unified diffs, patches

```ts
export class PatchError extends Error {}
export type Edit = { op: "keep" | "delete" | "insert"; line: string };
export interface UnifiedOptions { context?: number; fromFile?: string; toFile?: string }
export function diffLines(a: string[], b: string[]): Edit[]
export function unifiedDiff(a: string, b: string, options?: UnifiedOptions): string
export function applyPatch(a: string, patch: string): string
```

### The edit script

- **D1** `diffLines(a, b)` takes two arrays of lines (compared with `===`) and returns an edit
  script: a list of `keep` (a line of both), `delete` (a line of `a` only) and `insert` (a line
  of `b` only) edits. Reading the `keep` and `delete` lines in order gives `a`; reading the
  `keep` and `insert` lines gives `b`. Each edit's `line` is that line's text.
- **D2** The script is minimal: no script has fewer `delete` plus `insert` edits (equivalently,
  it keeps a longest common subsequence).
- **D3** The tie-break, exactly: of all minimal scripts, `diffLines` returns the one that comes
  first when scripts are compared edit by edit, from the start, with `keep` before `delete`
  before `insert`. In other words, at each step, while staying minimal: keep if you can, else
  delete if you can, else insert. So `["a","b"]` to `["b","a"]` is `delete a, keep b, insert a`
  (not `insert b, keep a, delete b`), and a changed region lists all its deletions before its
  insertions. This is not what every Myers implementation happens to produce; a dynamic
  programme over suffixes (the fewest edits turning `a[i..]` into `b[j..]`, for every `i`, `j`)
  then a greedy walk from the start gives it directly. Inputs of up to 2,000 lines each must be
  handled in well under a second.

### Unified diffs

- **D4** Texts are split into lines at `\n`. A text that ends with `\n` has no extra empty last
  line; the empty text has no lines; a text that does not end with `\n` has a last line with no
  newline. `\r` is ordinary content. Two lines are equal when their text is equal and either
  both or neither have a newline (so `"x"` and `"x\n"` differ in their only line).
- **D5** `unifiedDiff(a, b)` returns `""` when `a === b`. Otherwise it returns the header
  `--- <fromFile>\n+++ <toFile>\n` (defaults: `a` and `b`), then the hunks. Every line of the
  output, the last included, ends with `\n`.
- **D6** The edit script is D3's, over the lines of D4. A hunk is a run of changes (`delete` and
  `insert` edits) with up to `context` (default 3) kept lines before its first change and after
  its last, fewer where the file starts or ends. Two changes separated by at most `2 * context`
  kept lines belong to the same hunk; by more, to different hunks. So with `context` 3, a gap of
  exactly 6 unchanged lines merges two changes into one hunk, and a gap of 7 makes two hunks.
  `context: 0` puts each run of adjacent changes in a hunk of its own.
- **D7** A hunk is its header `@@ -<aStart>[,<aLen>] +<bStart>[,<bLen>] @@\n`, then its lines in
  script order: ` text` for a kept line, `-text` for a deleted one, `+text` for an inserted one.
  `aLen` is the number of kept and deleted lines in the hunk, `bLen` of kept and inserted lines;
  `,<len>` is omitted when the length is exactly 1 (and written when it is 0). `aStart` is the
  1-based number of the hunk's first line in `a`; when `aLen` is 0 it is instead the number of
  the line of `a` just before the hunk (0 at the start of the file). The same for `bStart` in
  `b`. So the diff of `""` to `"x\n"` has the hunk header `@@ -0,0 +1 @@`.
- **D8** A hunk line for the last line of a file with no newline is followed by the line
  `\ No newline at end of file` (a backslash, a space, then those words). For a kept line, which
  is then the last line of both files, the marker appears once.

### Applying a patch

- **D9** `applyPatch(a, patch)` applies a unified diff as D5-D8 write it, and returns the new
  text. The empty patch returns `a`. A patch must otherwise start with a line beginning `--- `
  and a line beginning `+++ ` (their file names are ignored), else `PatchError`. A patch that
  has those two lines and no hunk returns `a`.
- **D10** Every following line is a hunk header (`@@ -s[,l] +s[,l] @@`, optionally followed by
  a space and any text) or a hunk line starting with ` `, `-`, `+` or `\` (a no-newline marker
  for the hunk line just before it; a marker with no hunk line before it, or two in a row, is a
  `PatchError`). Anything else, an empty line included, is a `PatchError`. A missing `,l` means
  1. A final `\n` at the end of the patch is optional.
- **D11** A hunk's counts of old lines (kept and deleted) and new lines (kept and inserted) must
  equal its header's lengths, else `PatchError`. Its old start is checked; its new start is not.
  A hunk with old length 0 inserts after line `s` of `a` (`s` = 0: at the start). A hunk with a
  non-zero old length and an old start of 0 is a `PatchError`.
- **D12** Application is exact: no fuzz, no offset, no search. Each hunk's kept and deleted
  lines must equal the lines of `a` at its old start, text and newline status alike (D4), else
  `PatchError`. Hunks must come in order and must not overlap (a hunk starting before the end
  of the previous one is a `PatchError`); one starting past the end of `a` is a `PatchError`.
  Lines of `a` outside every hunk are copied unchanged. A result in which a line other than the
  last has no newline is a `PatchError`.
- **D13** For any texts `a` and `b` and any `context`, `applyPatch(a, unifiedDiff(a, b,
  { context }))` is `b`.

## 4. `src/cron.ts`: five-field cron in UTC

```ts
export class CronError extends Error {}
export interface CronSchedule {
  minute: number[]; hour: number[]; dayOfMonth: number[]; month: number[]; dayOfWeek: number[];
  dayOfMonthStar: boolean; dayOfWeekStar: boolean;
}
export function parseCron(expr: string): CronSchedule
export function next(expr: string, from: Date, count?: number): Date[]
```

All times are UTC: never use the local time zone (the tests run under several `TZ` values).

### Parsing

- **C1** An expression is five fields separated by one or more spaces or tabs, with leading and
  trailing whitespace ignored: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12),
  day-of-week (0-7, where both 0 and 7 are Sunday). Any other number of fields is a `CronError`
  with the message `expected 5 fields, got <n>` (the empty or all-blank expression has 0).
- **C2** A field is a comma-separated list of one or more items; an item is one of: `*`; a value
  `v`; a range `v-w` (inclusive; `v` must not be greater than `w`); any of those followed by
  `/step`, where `step` is a positive decimal integer. `*/s` and `v-w/s` take every `s`-th value
  of the range starting at its first (`*/15` is 0,15,30,45 for minutes; `10-50/20` is 10,30,50);
  `v/s` means from `v` to the field's top with step `s` (`5/10` in minutes is 5,15,...,55).
- **C3** Values are decimal digits (leading zeros allowed: `05` is 5) or, in the month field
  only, the names `JAN`-`DEC` (1-12), and in the day-of-week field only, the names `SUN`-`SAT`
  (0-6); names are exactly three letters and case-insensitive (`jan`, `Mon`). A name may be a
  range end (`MON-FRI`, `jan-mar`).
- **C4** The top of a field (the end of `*` and of `v/s`) is its maximum, except in day-of-week,
  where it is 6: `*` there is 0-6, `*/2` is 0,2,4,6, and `1/2` is 1,3,5. A 7 can be written only
  as a single value or as a range end (`7`, `5-7` = Friday, Saturday, Sunday); a range may start
  at 7 only when it also ends at 7 (`7-7`, and `7-7/3`, are Sunday); so `7/2` (from 7 to 6) is
  malformed. A range is expanded with its step first, and each 7 it gives then becomes 0
  (`5-7/2` is 5 and 7, so Friday and Sunday). Wrap-around ranges (`FRI-MON`, `50-10`, `7-6`) are
  malformed.
- **C5** A malformed field (an empty item as in `1,,2` or `1,`, a value out of range, a step of
  0, a name in the wrong field or not a three-letter name, a stray character, a sign...) is a
  `CronError` with the message `invalid <name> field "<text>"`, where `<name>` is `minute`,
  `hour`, `day-of-month`, `month` or `day-of-week` and `<text>` is the whole field as written:
  for `0 24 * * *` that is `invalid hour field "24"`. When several fields are malformed, the
  leftmost is reported.
- **C6** Macros, case-insensitive, replace the whole expression: `@yearly` and `@annually` are
  `0 0 1 1 *`, `@monthly` is `0 0 1 * *`, `@weekly` is `0 0 * * 0`, `@daily` and `@midnight` are
  `0 0 * * *`, `@hourly` is `0 * * * *`. Any other expression starting with `@` (after
  trimming), `@reboot` included, is a `CronError` with the message `unknown macro "<text>"`,
  `<text>` being the trimmed expression.
- **C7** `parseCron` returns each field's values as a sorted array without duplicates; in
  `dayOfWeek`, 7 becomes 0. `dayOfMonthStar` and `dayOfWeekStar` say whether that field's text
  begins with `*` (so `*` and `*/2` both do; for a macro, the text it expands to). `parseCron`
  does not check whether the schedule can ever fire.

### Matching and `next`

- **C8** A minute matches when its minute, hour and month are in their fields' sets and its day
  matches. A day matches by the Vixie rule: when `dayOfMonthStar` or `dayOfWeekStar` is true,
  the day must be in both the day-of-month and the day-of-week sets; when both are false (both
  fields restricted), it is enough to be in either. So `0 0 13 * FRI` fires on every 13th and on
  every Friday, while `0 0 */2 * FRI` fires only on Fridays with an odd day of the month.
- **C9** `next(expr, from, count = 1)` returns the first `count` matching minutes strictly after
  `from`, in increasing order, as `Date`s with zero seconds and milliseconds. Seconds and
  milliseconds of `from` are dropped first, then the search starts at the following minute: from
  `10:00:00.000` or from `10:00:59.999`, an every-minute schedule's first time is `10:01`.
- **C10** Months without the day are skipped: `0 0 31 * *` fires only in months with 31 days,
  `0 0 29 2 *` only on 29 February of leap years (Gregorian: 2100 is not a leap year, 2000 was).
- **C11** An expression that can never fire (`0 0 30 2 *`, `0 0 31 4,6,9,11 *`) makes `next`
  throw a `CronError` with the message `schedule never fires`, promptly (well under a second),
  never loop forever. Rare is not never: `0 0 29 2 */7` (29 February when it is a Sunday) does
  fire, possibly decades after `from`. The Gregorian calendar repeats exactly every 400 years
  (146,097 days, a whole number of weeks), so a schedule that does not fire within 146,097 days
  never does.
- **C12** `next` checks, in this order: the expression (as `parseCron` does), then `from`, which
  must be a valid `Date` (else `CronError` with the message `invalid date`), then `count`, which
  must be a positive integer (else `CronError` with the message `invalid count`). `next` does not
  modify `from`.
