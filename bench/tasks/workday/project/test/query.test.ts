import { describe, expect, test } from "bun:test";
import { query, QueryError, type Row } from "../src/query";

const people: Row[] = [
  { id: 1, name: "Ann", dept: "eng", salary: 120, age: 30, city: "Oslo" },
  { id: 2, name: "bob", dept: "eng", salary: 100, age: null, city: "Rome" },
  { id: 3, name: "Cid", dept: "ops", salary: 90, city: "Oslo" },
  { id: 4, name: "Dee", dept: "ops", salary: null, age: 41, city: "Paris" },
  { id: 5, name: "Eve", dept: null, salary: 70, age: 25, city: "Rome" },
  { id: 6, name: "Fay", dept: "eng", salary: 100, age: 35, city: "O'Hare", note: "x" },
];
const db: Record<string, Row[]> = {
  people,
  empty: [],
  mixed: [{ v: 1 }, { v: "1" }, { v: null }, {}],
  one: [{ k: 1 }],
  files: [{ f: "a.c" }, { f: "abc" }, { f: "a*c" }, { f: "" }],
  emoji: [{ s: "😀" }],
};

const q = (sql: string) => query(sql, db);
const ids = (sql: string) => q(sql).map((r) => r.id);
const names = (sql: string) => q(sql).map((r) => r.name);

function fails(sql: string, contains?: string) {
  let err: unknown;
  try {
    query(sql, db);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(QueryError);
  if (contains !== undefined) expect((err as Error).message).toContain(contains);
}

describe("lexing and grammar", () => {
  test("Q1 keywords are case-insensitive", () => {
    expect(q("select name from people where id = 1")).toEqual([{ name: "Ann" }]);
    expect(q("SeLeCt name FrOm people WhErE id = 2")).toEqual([{ name: "bob" }]);
  });

  test("Q1 reserved words are never identifiers", () => {
    fails("SELECT count FROM people");
    fails("SELECT name AS order FROM people");
  });

  test("Q2 Q7 Q8 identifiers are case-sensitive", () => {
    fails("SELECT Name FROM people", "Name");
    fails("SELECT name FROM People", "People");
  });

  test("Q3 strings with a doubled quote", () => {
    expect(ids("SELECT id FROM people WHERE city = 'O''Hare'")).toEqual([6]);
    expect(q("SELECT 'it''s' AS s FROM one")).toEqual([{ s: "it's" }]);
  });

  test("Q3 bad characters and unterminated strings", () => {
    fails("SELECT id FROM people WHERE city = 'Oslo");
    fails("SELECT id FROM people;");
    fails('SELECT id FROM people WHERE city = "Oslo"');
    fails("SELECT id FROM people WHERE !id");
  });

  test("Q4 clause order and trailing tokens", () => {
    fails("SELECT * FROM people LIMIT 1 WHERE id = 1");
    fails("SELECT * FROM people OFFSET 1 LIMIT 1");
    fails("SELECT * FROM people ORDER BY id GROUP BY id");
    fails("SELECT id FROM people WHERE id = 1 1");
  });

  test("Q4 select list forms", () => {
    fails("SELECT *, id FROM people");
    fails("SELECT id, * FROM people");
    fails("SELECT name n FROM people");
    fails("SELECT FROM people");
  });

  test("Q4 LIMIT and OFFSET take non-negative integer literals", () => {
    expect(names("SELECT name FROM people OFFSET 4")).toEqual(["Eve", "Fay"]);
    fails("SELECT id FROM people LIMIT 1.5");
    fails("SELECT id FROM people LIMIT -1");
    fails("SELECT id FROM people LIMIT id");
  });

  test("Q4 Q10 table aliases with and without AS", () => {
    expect(names("SELECT p.name FROM people p WHERE p.id = 2")).toEqual(["bob"]);
    expect(names("SELECT x.name FROM people AS x WHERE id = 3")).toEqual(["Cid"]);
    expect(names("SELECT people.name FROM people WHERE people.id = 1")).toEqual(["Ann"]);
  });

  test("Q5 OR is looser than AND, NOT looser than comparisons", () => {
    expect(ids("SELECT id FROM people WHERE dept = 'eng' OR dept = 'ops' AND salary > 95")).toEqual([1, 2, 6]);
    expect(ids("SELECT id FROM people WHERE NOT dept = 'eng'")).toEqual([3, 4]);
    expect(ids("SELECT id FROM people WHERE (dept = 'eng' OR dept = 'ops') AND salary > 95")).toEqual([1, 2, 6]);
  });

  test("Q5 comparisons do not chain", () => {
    fails("SELECT id FROM people WHERE id = 1 = TRUE");
    fails("SELECT id FROM people WHERE 1 < id < 3");
  });

  test("Q5 the AND of BETWEEN belongs to it", () => {
    expect(ids("SELECT id FROM people WHERE salary BETWEEN 90 AND 100 AND dept = 'eng'")).toEqual([2, 6]);
  });

  test("Q5 arithmetic precedence", () => {
    expect(q("SELECT 1 + 2 * 3 AS a, 10 - 4 - 3 AS b, -k * 2 AS c, (1 + 2) * 3 AS d FROM one")).toEqual([
      { a: 7, b: 3, c: -2, d: 9 },
    ]);
  });

  test("Q6 DISTINCT is only for COUNT", () => {
    fails("SELECT SUM(DISTINCT salary) FROM people");
    fails("SELECT MAX(*) FROM people");
  });
});

describe("tables and columns", () => {
  test("Q7 unknown tables", () => {
    fails("SELECT * FROM nope", "nope");
    fails("SELECT * FROM toString", "toString");
  });

  test("Q8 columns are the union of all rows' keys", () => {
    expect(q("SELECT note FROM people").map((r) => r.note)).toEqual([null, null, null, null, null, "x"]);
  });

  test("Q8 unknown columns fail before any row is read", () => {
    fails("SELECT id FROM people WHERE FALSE AND nope = 1", "nope");
    fails("SELECT id FROM people ORDER BY nope", "nope");
    fails("SELECT COUNT(nope) FROM people", "nope");
  });

  test("Q8 an empty table has no columns", () => {
    fails("SELECT id FROM empty", "id");
    expect(q("SELECT * FROM empty")).toEqual([]);
  });

  test("Q9 missing keys are NULL", () => {
    expect(ids("SELECT id FROM people WHERE age IS NULL")).toEqual([2, 3]);
    expect(query("SELECT a FROM t", { t: [{ a: undefined, b: 1 } as unknown as Row] })).toEqual([{ a: null }]);
  });

  test("Q10 qualifiers must match the alias, or the table's name when there is none", () => {
    fails("SELECT people.name FROM people p");
    fails("SELECT x.name FROM people");
  });
});

describe("NULL and three-valued logic", () => {
  test("Q11 = NULL is never true", () => {
    expect(ids("SELECT id FROM people WHERE salary = NULL")).toEqual([]);
    expect(ids("SELECT id FROM people WHERE salary <> NULL")).toEqual([]);
  });

  test("Q11 = and <> across types", () => {
    expect(q("SELECT v = 1 AS a, v <> 1 AS b, v != '1' AS c FROM mixed")).toEqual([
      { a: true, b: false, c: true },
      { a: false, b: true, c: false },
      { a: null, b: null, c: null },
      { a: null, b: null, c: null },
    ]);
  });

  test("Q11 ordering comparisons across types fail", () => {
    fails("SELECT v FROM mixed WHERE v < 2");
    fails("SELECT id FROM people WHERE name > 1");
  });

  test("Q11 strings by code unit, FALSE < TRUE", () => {
    expect(names("SELECT name FROM people WHERE name < 'a'")).toEqual(["Ann", "Cid", "Dee", "Eve", "Fay"]);
    expect(q("SELECT TRUE > FALSE AS x FROM one")).toEqual([{ x: true }]);
  });

  test("Q12 three-valued AND, OR, NOT", () => {
    expect(
      q("SELECT FALSE AND NULL AS a, TRUE OR NULL AS b, NOT NULL AS c, TRUE AND NULL AS d, FALSE OR NULL AS e FROM one"),
    ).toEqual([{ a: false, b: true, c: null, d: null, e: null }]);
  });

  test("Q12 both operands are evaluated and must be boolean", () => {
    fails("SELECT id FROM people WHERE FALSE AND 1");
    fails("SELECT id FROM people WHERE TRUE OR name");
    fails("SELECT id FROM people WHERE NOT salary");
  });

  test("Q13 IS NULL and IS NOT NULL", () => {
    expect(q("SELECT age IS NULL AS a, age IS NOT NULL AS b FROM people WHERE id = 3")).toEqual([{ a: true, b: false }]);
    expect(ids("SELECT id FROM people WHERE dept IS NOT NULL AND age IS NOT NULL")).toEqual([1, 4, 6]);
  });

  test("Q14 IN", () => {
    expect(ids("SELECT id FROM people WHERE id IN (1, 3, 99)")).toEqual([1, 3]);
    expect(ids("SELECT id FROM people WHERE id IN ('1')")).toEqual([]);
    expect(ids("SELECT id FROM people WHERE id IN (2 + 2, salary / 50)")).toEqual([2, 4]);
  });

  test("Q14 NOT IN with a NULL in the list matches nothing", () => {
    expect(ids("SELECT id FROM people WHERE id NOT IN (1, NULL)")).toEqual([]);
    expect(q("SELECT 3 NOT IN (1, NULL) AS x, 1 IN (1, NULL) AS y, NULL IN (1) AS z, 2 NOT IN (1) AS w FROM one")).toEqual([
      { x: null, y: true, z: null, w: true },
    ]);
    expect(ids("SELECT id FROM people WHERE dept NOT IN ('eng')")).toEqual([3, 4]);
  });

  test("Q15 BETWEEN is inclusive and three-valued", () => {
    expect(ids("SELECT id FROM people WHERE salary BETWEEN 90 AND 100")).toEqual([2, 3, 6]);
    expect(ids("SELECT id FROM people WHERE salary NOT BETWEEN 90 AND 100")).toEqual([1, 5]);
    expect(ids("SELECT id FROM people WHERE salary BETWEEN 100 AND 90")).toEqual([]);
    expect(ids("SELECT id FROM people WHERE name BETWEEN 'B' AND 'E'")).toEqual([3, 4]);
  });

  test("Q16 LIKE is case-sensitive and matches the whole string", () => {
    expect(names("SELECT name FROM people WHERE name LIKE 'A%'")).toEqual(["Ann"]);
    expect(names("SELECT name FROM people WHERE name LIKE 'a%'")).toEqual([]);
    expect(names("SELECT name FROM people WHERE name LIKE '_o_'")).toEqual(["bob"]);
    expect(ids("SELECT id FROM people WHERE city LIKE 'O__o'")).toEqual([1, 3]);
    expect(ids("SELECT id FROM people WHERE city LIKE 'Os'")).toEqual([]);
  });

  test("Q16 regular-expression characters are literal; % matches the empty string", () => {
    expect(q("SELECT f FROM files WHERE f LIKE 'a.c'")).toEqual([{ f: "a.c" }]);
    expect(q("SELECT f FROM files WHERE f LIKE 'a*c'")).toEqual([{ f: "a*c" }]);
    expect(q("SELECT f FROM files WHERE f LIKE '%'").length).toBe(4);
    expect(q("SELECT f FROM files WHERE f LIKE '_%'").length).toBe(3);
  });

  test("Q16 _ is one UTF-16 code unit", () => {
    expect(q("SELECT s LIKE '_' AS one, s LIKE '__' AS two FROM emoji")).toEqual([{ one: false, two: true }]);
  });

  test("Q16 LIKE with NULL and non-strings", () => {
    expect(q("SELECT dept LIKE '%' AS x, dept NOT LIKE '%' AS y FROM people WHERE id = 5")).toEqual([{ x: null, y: null }]);
    fails("SELECT id FROM people WHERE id LIKE '1'");
    expect(names("SELECT name FROM people WHERE name NOT LIKE '%e%'")).toEqual(["Ann", "bob", "Cid", "Fay"]);
  });

  test("Q17 arithmetic, division and NULL", () => {
    expect(q("SELECT 7 / 2 AS a, 7 % 2 AS b, 1 / 0 AS c, 5 % 0 AS d, -NULL AS e, NULL + 1 AS f FROM one")).toEqual([
      { a: 3.5, b: 1, c: null, d: null, e: null, f: null },
    ]);
  });

  test("Q17 arithmetic on non-numbers fails", () => {
    fails("SELECT name + 1 AS x FROM people");
    fails("SELECT 'a' + 'b' AS x FROM one");
    fails("SELECT -name AS x FROM people");
  });

  test("Q17 a NULL operand gives NULL before any type check", () => {
    expect(
      q("SELECT NULL + 'a' AS a, TRUE * NULL AS b, 'x' % NULL AS c, NULL - FALSE AS d, name / NULL AS e FROM people WHERE id = 1"),
    ).toEqual([{ a: null, b: null, c: null, d: null, e: null }]);
    expect(ids("SELECT id FROM people WHERE NULL * name IS NULL")).toEqual([1, 2, 3, 4, 5, 6]);
    fails("SELECT name + salary AS x FROM people");
    fails("SELECT 'a' / 0 AS x FROM one");
    fails("SELECT name % 0 AS x FROM people WHERE id = 1");
  });

  test("Q16 a NULL operand gives NULL before the string check", () => {
    expect(q("SELECT NULL LIKE 1 AS a, k LIKE NULL AS b, NULL NOT LIKE TRUE AS c FROM one")).toEqual([
      { a: null, b: null, c: null },
    ]);
  });

  test("Q12 Q15 both comparisons of BETWEEN are evaluated", () => {
    fails("SELECT 5 BETWEEN 9 AND 'a' AS x FROM one");
    fails("SELECT 5 NOT BETWEEN 9 AND 'a' AS x FROM one");
    fails("SELECT 1 BETWEEN NULL AND 'a' AS x FROM one");
    expect(q("SELECT NULL BETWEEN 'a' AND 1 AS x, k BETWEEN NULL AND 0 AS y FROM one")).toEqual([{ x: null, y: false }]);
  });

  test("Q18 Q24 WHERE keeps only TRUE, in table order", () => {
    expect(ids("SELECT id FROM people WHERE salary > 95")).toEqual([1, 2, 6]);
    expect(ids("SELECT id FROM people WHERE NOT (salary > 95)")).toEqual([3, 5]);
  });

  test("Q18 a non-boolean condition fails", () => {
    fails("SELECT id FROM people WHERE salary");
    fails("SELECT dept FROM people GROUP BY dept HAVING COUNT(*)");
  });
});

describe("grouping and aggregates", () => {
  test("Q19 an aggregate without GROUP BY gives one row even over no rows", () => {
    expect(q("SELECT COUNT(*) FROM people WHERE FALSE")).toEqual([{ "COUNT(*)": 0 }]);
    expect(q("SELECT COUNT(*) AS n FROM empty")).toEqual([{ n: 0 }]);
  });

  test("Q19 groups come in order of first appearance, NULL a group of its own", () => {
    expect(q("SELECT dept, COUNT(*) AS n FROM people GROUP BY dept")).toEqual([
      { dept: "eng", n: 3 },
      { dept: "ops", n: 2 },
      { dept: null, n: 1 },
    ]);
  });

  test("Q19 GROUP BY over no rows gives no rows", () => {
    expect(q("SELECT dept, COUNT(*) AS n FROM people WHERE FALSE GROUP BY dept")).toEqual([]);
  });

  test("Q19 group keys compare by type and value", () => {
    expect(q("SELECT v, COUNT(*) AS n FROM mixed GROUP BY v")).toEqual([
      { v: 1, n: 1 },
      { v: "1", n: 1 },
      { v: null, n: 2 },
    ]);
  });

  test("Q19 HAVING alone, or an aggregate in ORDER BY, makes a query grouped", () => {
    expect(q("SELECT COUNT(*) AS n FROM people HAVING COUNT(*) > 10")).toEqual([]);
    expect(q("SELECT COUNT(*) AS n FROM people HAVING MAX(salary) = 120")).toEqual([{ n: 6 }]);
    fails("SELECT name FROM people ORDER BY COUNT(*)");
  });

  test("Q19 HAVING filters groups", () => {
    expect(q("SELECT dept FROM people GROUP BY dept HAVING COUNT(*) >= 2 AND MIN(salary) > 80")).toEqual([
      { dept: "eng" },
      { dept: "ops" },
    ]);
  });

  test("Q20 a column outside an aggregate must be grouped", () => {
    fails("SELECT name, COUNT(*) FROM people GROUP BY dept", "name");
    fails("SELECT COUNT(name), name FROM people");
    fails("SELECT dept FROM people GROUP BY dept HAVING salary > 1");
    fails("SELECT dept FROM people GROUP BY dept ORDER BY name");
  });

  test("Q20 SELECT * when grouped, nested aggregates, aggregates in WHERE", () => {
    fails("SELECT * FROM people GROUP BY dept");
    fails("SELECT SUM(COUNT(*)) FROM people");
    fails("SELECT id FROM people WHERE COUNT(*) > 1");
  });

  test("Q20 grouped columns may be qualified and used in expressions", () => {
    expect(q("SELECT p.dept, MAX(salary) - MIN(salary) AS spread FROM people p GROUP BY dept")).toEqual([
      { dept: "eng", spread: 20 },
      { dept: "ops", spread: 0 },
      { dept: null, spread: 0 },
    ]);
  });

  test("Q21 aggregates ignore NULL", () => {
    expect(
      q(
        "SELECT COUNT(*) AS a, COUNT(age) AS b, COUNT(DISTINCT salary) AS c, SUM(salary) AS d, AVG(salary) AS e, MIN(name) AS f, MAX(age) AS g FROM people",
      ),
    ).toEqual([{ a: 6, b: 4, c: 4, d: 480, e: 96, f: "Ann", g: 41 }]);
  });

  test("Q21 AVG divides by the non-NULL count, per group", () => {
    expect(q("SELECT dept, AVG(salary) AS a FROM people GROUP BY dept")).toEqual([
      { dept: "eng", a: 320 / 3 },
      { dept: "ops", a: 90 },
      { dept: null, a: 70 },
    ]);
  });

  test("Q21 aggregates of nothing", () => {
    expect(q("SELECT SUM(salary) AS s, AVG(salary) AS a, MIN(salary) AS m, COUNT(salary) AS c FROM people WHERE id > 100")).toEqual([
      { s: null, a: null, m: null, c: 0 },
    ]);
    expect(q("SELECT SUM(salary) AS s, COUNT(salary) AS c FROM people WHERE id = 4")).toEqual([{ s: null, c: 0 }]);
  });

  test("Q21 COUNT(DISTINCT) distinguishes types", () => {
    expect(q("SELECT COUNT(DISTINCT v) AS n, COUNT(v) AS m FROM mixed")).toEqual([{ n: 2, m: 2 }]);
  });

  test("Q21 type errors in aggregates", () => {
    fails("SELECT SUM(name) FROM people");
    fails("SELECT AVG(dept) FROM people");
    fails("SELECT MIN(v) FROM mixed");
  });
});

describe("output", () => {
  test("Q22 unaliased items are named by their exact source text", () => {
    expect(q("SELECT count(*), SUM( salary ), Max(age) FROM people")).toEqual([
      { "count(*)": 6, "SUM( salary )": 480, "Max(age)": 41 },
    ]);
    expect(q("SELECT salary * 2, p.name, (salary + 1) * 2, (id) FROM people p WHERE id = 1")).toEqual([
      { "salary * 2": 240, name: "Ann", "(salary + 1) * 2": 242, id: 1 },
    ]);
  });

  test("Q22 keys follow the select order", () => {
    const [r] = q("SELECT salary, id AS a, name FROM people WHERE id = 1");
    expect(Object.keys(r!)).toEqual(["salary", "a", "name"]);
  });

  test("Q22 duplicate keys fail", () => {
    fails("SELECT id, id FROM people");
    fails("SELECT name AS id, id FROM people");
    fails("SELECT p.id, id FROM people p");
  });

  test("Q23 SELECT * gives every column, null where missing", () => {
    const [r] = q("SELECT * FROM people WHERE id = 1");
    expect(r).toEqual({ id: 1, name: "Ann", dept: "eng", salary: 120, age: 30, city: "Oslo", note: null });
    expect(Object.keys(r!)).toEqual(["id", "name", "dept", "salary", "age", "city", "note"]);
    expect(q("SELECT * FROM mixed")).toEqual([{ v: 1 }, { v: "1" }, { v: null }, { v: null }]);
  });

  test("Q25 DISTINCT keeps the first of equal rows", () => {
    expect(q("SELECT DISTINCT dept FROM people")).toEqual([{ dept: "eng" }, { dept: "ops" }, { dept: null }]);
    expect(q("SELECT DISTINCT salary, dept FROM people").length).toBe(5);
    expect(q("SELECT DISTINCT v FROM mixed")).toEqual([{ v: 1 }, { v: "1" }, { v: null }]);
  });

  test("Q26 ORDER BY an alias", () => {
    expect(names("SELECT name, name AS n FROM people ORDER BY n DESC LIMIT 2")).toEqual(["bob", "Fay"]);
  });

  test("Q26 an output name shadows a table column", () => {
    expect(names("SELECT id AS salary, name FROM people ORDER BY salary DESC LIMIT 2")).toEqual(["Fay", "Eve"]);
    expect(names("SELECT name, id AS salary FROM people p ORDER BY p.salary DESC LIMIT 1")).toEqual(["Ann"]);
  });

  test("Q26 ORDER BY position", () => {
    expect(names("SELECT name, salary FROM people ORDER BY 2 DESC, 1")).toEqual(["Ann", "Fay", "bob", "Cid", "Eve", "Dee"]);
    fails("SELECT name, salary FROM people ORDER BY 3");
    fails("SELECT name FROM people ORDER BY 0");
    fails("SELECT name FROM people ORDER BY 1.5");
  });

  test("Q4 Q22 GROUP BY takes column references without parentheses", () => {
    fails("SELECT dept FROM people GROUP BY (dept)");
    expect(q("SELECT (dept), COUNT(*) AS n FROM people GROUP BY dept")).toEqual([
      { dept: "eng", n: 3 },
      { dept: "ops", n: 2 },
      { dept: null, n: 1 },
    ]);
  });

  test("Q26 parentheses do not change an ORDER BY item's kind", () => {
    expect(names("SELECT id, name FROM people ORDER BY (2) DESC")).toEqual(["bob", "Fay", "Eve", "Dee", "Cid", "Ann"]);
    expect(ids("SELECT id, age FROM people ORDER BY ((2)), id DESC")).toEqual([3, 2, 5, 1, 6, 4]);
    expect(ids("SELECT id, name AS salary FROM people ORDER BY (salary)")).toEqual([1, 3, 4, 5, 6, 2]);
    expect(q("SELECT DISTINCT dept FROM people ORDER BY (1) DESC")).toEqual([{ dept: "ops" }, { dept: "eng" }, { dept: null }]);
    expect(q("SELECT DISTINCT dept AS d FROM people ORDER BY (d)")).toEqual([{ d: null }, { d: "eng" }, { d: "ops" }]);
    fails("SELECT name FROM people ORDER BY (2)");
    fails("SELECT name, id FROM people ORDER BY (2.0)");
  });

  test("Q3 Q26 only a number written without '.' is a position", () => {
    fails("SELECT name, id FROM people ORDER BY 2.0");
    expect(ids("SELECT id, name FROM people ORDER BY -1")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids("SELECT id, name FROM people ORDER BY -2 DESC, 2")).toEqual([1, 3, 4, 5, 6, 2]);
    expect(ids("SELECT id, salary FROM people ORDER BY -1, 2 DESC, id")).toEqual([1, 2, 6, 3, 5, 4]);
    fails("SELECT DISTINCT id FROM people ORDER BY -1");
  });

  test("Q26 ORDER BY a column not selected", () => {
    expect(names("SELECT name FROM people ORDER BY salary, id")).toEqual(["Dee", "Eve", "Cid", "bob", "Fay", "Ann"]);
    expect(names("SELECT name FROM people ORDER BY salary * -1, id DESC")).toEqual(["Dee", "Ann", "Fay", "bob", "Cid", "Eve"]);
  });

  test("Q26 DISTINCT allows only output columns in ORDER BY", () => {
    fails("SELECT DISTINCT dept FROM people ORDER BY salary");
    expect(q("SELECT DISTINCT dept FROM people ORDER BY dept DESC")).toEqual([{ dept: "ops" }, { dept: "eng" }, { dept: null }]);
    expect(q("SELECT DISTINCT dept AS d FROM people ORDER BY 1")).toEqual([{ d: null }, { d: "eng" }, { d: "ops" }]);
  });

  test("Q26 grouped ORDER BY an aggregate", () => {
    expect(q("SELECT dept FROM people GROUP BY dept ORDER BY COUNT(*), dept")).toEqual([
      { dept: null },
      { dept: "ops" },
      { dept: "eng" },
    ]);
  });

  test("Q27 NULLs first ascending, last descending; ties keep table order", () => {
    expect(ids("SELECT id FROM people ORDER BY dept")).toEqual([5, 1, 2, 6, 3, 4]);
    expect(ids("SELECT id FROM people ORDER BY dept DESC")).toEqual([3, 4, 1, 2, 6, 5]);
    expect(ids("SELECT id FROM people ORDER BY age DESC")).toEqual([4, 6, 1, 5, 2, 3]);
  });

  test("Q27 mixed types in a sort key fail, even past the LIMIT", () => {
    fails("SELECT v FROM mixed ORDER BY v LIMIT 1");
  });

  test("Q28 OFFSET then LIMIT, after ORDER BY and DISTINCT", () => {
    expect(ids("SELECT id FROM people ORDER BY id DESC LIMIT 2 OFFSET 1")).toEqual([5, 4]);
    expect(ids("SELECT id FROM people LIMIT 0")).toEqual([]);
    expect(ids("SELECT id FROM people OFFSET 10")).toEqual([]);
    expect(q("SELECT DISTINCT dept FROM people LIMIT 2")).toEqual([{ dept: "eng" }, { dept: "ops" }]);
  });

  test("Q28 the result is new objects, the input untouched", () => {
    const before = JSON.stringify(people);
    const out = q("SELECT * FROM people ORDER BY id DESC");
    out[0]!.name = "changed";
    expect(JSON.stringify(people)).toBe(before);
  });
});
