import { afterAll, describe, expect, test } from "bun:test";
import { CronError, next, parseCron } from "../src/cron";

const at = (iso: string) => new Date(iso);
const iso = (ds: Date[]) => ds.map((d) => d.toISOString());
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

function cronFails(f: () => unknown, message: string) {
  let err: unknown;
  try {
    f();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(CronError);
  expect((err as Error).message).toBe(message);
}

const originalTZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe("parseCron", () => {
  test("C1 C7 every field of * * * * *", () => {
    expect(parseCron("* * * * *")).toEqual({
      minute: range(0, 59),
      hour: range(0, 23),
      dayOfMonth: range(1, 31),
      month: range(1, 12),
      dayOfWeek: range(0, 6),
      dayOfMonthStar: true,
      dayOfWeekStar: true,
    });
  });

  test("C1 whitespace between and around fields", () => {
    const s = parseCron(" \t0  12\t* *   1 ");
    expect([s.minute, s.hour, s.dayOfWeek]).toEqual([[0], [12], [1]]);
  });

  test("C1 the number of fields", () => {
    cronFails(() => parseCron("* * * *"), "expected 5 fields, got 4");
    cronFails(() => parseCron("* * * * * *"), "expected 5 fields, got 6");
    cronFails(() => parseCron(""), "expected 5 fields, got 0");
    cronFails(() => parseCron(" \t "), "expected 5 fields, got 0");
  });

  test("C2 steps over * and ranges", () => {
    expect(parseCron("*/15 * * * *").minute).toEqual([0, 15, 30, 45]);
    expect(parseCron("10-50/20 * * * *").minute).toEqual([10, 30, 50]);
    expect(parseCron("0 */7 * * *").hour).toEqual([0, 7, 14, 21]);
    expect(parseCron("0 0 */10 * *").dayOfMonth).toEqual([1, 11, 21, 31]);
    expect(parseCron("0 0 1 */4 *").month).toEqual([1, 5, 9]);
  });

  test("C2 v/step runs to the field's top", () => {
    expect(parseCron("5/10 * * * *").minute).toEqual([5, 15, 25, 35, 45, 55]);
    expect(parseCron("0 0 1 2/5 *").month).toEqual([2, 7, 12]);
    expect(parseCron("0 20/2 * * *").hour).toEqual([20, 22]);
  });

  test("C2 C7 lists are sorted and deduplicated", () => {
    expect(parseCron("1,5,3,5 * * * *").minute).toEqual([1, 3, 5]);
    expect(parseCron("0-4/3,10,2 * * * *").minute).toEqual([0, 2, 3, 10]);
    expect(parseCron("59,0 * * * *").minute).toEqual([0, 59]);
  });

  test("C3 names, case-insensitive, and leading zeros", () => {
    expect(parseCron("0 0 1 JAN,mar,Dec *").month).toEqual([1, 3, 12]);
    expect(parseCron("0 0 1 jan-MAR *").month).toEqual([1, 2, 3]);
    expect(parseCron("0 0 * * MON-FRI").dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron("0 0 * * sun,Sat").dayOfWeek).toEqual([0, 6]);
    expect(parseCron("05 007 * * *").minute).toEqual([5]);
  });

  test("C4 day-of-week: * is 0-6 and 7 is Sunday", () => {
    expect(parseCron("0 0 * * */2").dayOfWeek).toEqual([0, 2, 4, 6]);
    expect(parseCron("0 0 * * 1/2").dayOfWeek).toEqual([1, 3, 5]);
    expect(parseCron("0 0 * * 5-7").dayOfWeek).toEqual([0, 5, 6]);
    expect(parseCron("0 0 * * 7").dayOfWeek).toEqual([0]);
    expect(parseCron("0 0 * * 0,7").dayOfWeek).toEqual([0]);
    expect(parseCron("0 0 * * */3").dayOfWeek).toEqual([0, 3, 6]);
  });

  test("C4 wrap-around ranges and 7/step are malformed", () => {
    cronFails(() => parseCron("0 0 * * 7/2"), 'invalid day-of-week field "7/2"');
    cronFails(() => parseCron("0 0 * * FRI-MON"), 'invalid day-of-week field "FRI-MON"');
    cronFails(() => parseCron("50-10 * * * *"), 'invalid minute field "50-10"');
  });

  test("C4 a range may start at 7 only when it ends there; a stepped 7 is Sunday", () => {
    expect(parseCron("0 0 * * 7-7").dayOfWeek).toEqual([0]);
    expect(parseCron("0 0 * * 7-7/3").dayOfWeek).toEqual([0]);
    expect(parseCron("0 0 * * 5-7/2").dayOfWeek).toEqual([0, 5]);
    expect(parseCron("0 0 * * 1-7/3").dayOfWeek).toEqual([0, 1, 4]);
    expect(parseCron("0 0 * * sat-7").dayOfWeek).toEqual([0, 6]);
    expect(parseCron("0 0 * * 7-7").dayOfWeekStar).toBe(false);
    cronFails(() => parseCron("0 0 * * 7-6"), 'invalid day-of-week field "7-6"');
    cronFails(() => parseCron("0 0 * * 7-0"), 'invalid day-of-week field "7-0"');
    cronFails(() => parseCron("0 0 * * 7-SUN"), 'invalid day-of-week field "7-SUN"');
  });

  test("C4 C8 7-7 restricts the day-of-week field", () => {
    expect(iso(next("0 12 13 * 7-7", at("2024-03-01T00:00:00Z"), 3))).toEqual([
      "2024-03-03T12:00:00.000Z",
      "2024-03-10T12:00:00.000Z",
      "2024-03-13T12:00:00.000Z",
    ]);
  });

  test("C5 values out of range, with each field's name", () => {
    cronFails(() => parseCron("60 * * * *"), 'invalid minute field "60"');
    cronFails(() => parseCron("0 24 * * *"), 'invalid hour field "24"');
    cronFails(() => parseCron("* * 0 * *"), 'invalid day-of-month field "0"');
    cronFails(() => parseCron("* * 1,32 * *"), 'invalid day-of-month field "1,32"');
    cronFails(() => parseCron("* * * 13 *"), 'invalid month field "13"');
    cronFails(() => parseCron("* * * 0 *"), 'invalid month field "0"');
    cronFails(() => parseCron("* * * * 8"), 'invalid day-of-week field "8"');
  });

  test("C5 empty items and zero steps", () => {
    cronFails(() => parseCron("1,,2 * * * *"), 'invalid minute field "1,,2"');
    cronFails(() => parseCron("1, * * * *"), 'invalid minute field "1,"');
    cronFails(() => parseCron("*/0 * * * *"), 'invalid minute field "*/0"');
    cronFails(() => parseCron("0 0-23/0 * * *"), 'invalid hour field "0-23/0"');
  });

  test("C5 names in the wrong field, or not three letters", () => {
    cronFails(() => parseCron("* * * MON *"), 'invalid month field "MON"');
    cronFails(() => parseCron("* * * * JAN"), 'invalid day-of-week field "JAN"');
    cronFails(() => parseCron("MON * * * *"), 'invalid minute field "MON"');
    cronFails(() => parseCron("* * * JANUARY *"), 'invalid month field "JANUARY"');
    cronFails(() => parseCron("* * * * MO"), 'invalid day-of-week field "MO"');
  });

  test("C5 stray characters and signs", () => {
    cronFails(() => parseCron("5x * * * *"), 'invalid minute field "5x"');
    cronFails(() => parseCron("-5 * * * *"), 'invalid minute field "-5"');
    cronFails(() => parseCron("+5 * * * *"), 'invalid minute field "+5"');
    cronFails(() => parseCron("1-2-3 * * * *"), 'invalid minute field "1-2-3"');
    cronFails(() => parseCron("*/ * * * *"), 'invalid minute field "*/"');
    cronFails(() => parseCron("1/2/3 * * * *"), 'invalid minute field "1/2/3"');
    cronFails(() => parseCron("* * ? * *"), 'invalid day-of-month field "?"');
    cronFails(() => parseCron("*-5 * * * *"), 'invalid minute field "*-5"');
  });

  test("C5 the leftmost malformed field is reported", () => {
    cronFails(() => parseCron("0 24 32 * *"), 'invalid hour field "24"');
    cronFails(() => parseCron("* * * 13 8"), 'invalid month field "13"');
  });

  test("C6 macros", () => {
    expect(parseCron("@daily")).toEqual(parseCron("0 0 * * *"));
    expect(parseCron("@midnight")).toEqual(parseCron("0 0 * * *"));
    expect(parseCron("@hourly")).toEqual(parseCron("0 * * * *"));
    expect(parseCron("@monthly")).toEqual(parseCron("0 0 1 * *"));
    expect(parseCron("@annually")).toEqual(parseCron("0 0 1 1 *"));
    expect(parseCron("@YEARLY")).toEqual(parseCron("0 0 1 1 *"));
    expect(parseCron("  @Weekly ")).toEqual(parseCron("0 0 * * 0"));
  });

  test("C6 C7 a macro's star flags are its expansion's", () => {
    const w = parseCron("@weekly");
    expect([w.dayOfMonthStar, w.dayOfWeekStar]).toEqual([true, false]);
    const m = parseCron("@monthly");
    expect([m.dayOfMonthStar, m.dayOfWeekStar]).toEqual([false, true]);
  });

  test("C6 unknown macros", () => {
    cronFails(() => parseCron("@reboot"), 'unknown macro "@reboot"');
    cronFails(() => parseCron(" @daily * "), 'unknown macro "@daily *"');
    cronFails(() => parseCron("@"), 'unknown macro "@"');
  });

  test("C7 star flags follow the text, not the values", () => {
    const a = parseCron("0 0 */2 * 1");
    expect([a.dayOfMonthStar, a.dayOfWeekStar]).toEqual([true, false]);
    const b = parseCron("0 0 1-31 * 0-6");
    expect([b.dayOfMonthStar, b.dayOfWeekStar]).toEqual([false, false]);
    const c = parseCron("0 0 *,5 * *");
    expect(c.dayOfMonthStar).toBe(true);
  });

  test("C7 parseCron does not check whether the schedule can fire", () => {
    expect(parseCron("0 0 30 2 *").dayOfMonth).toEqual([30]);
  });
});

describe("next", () => {
  test("C9 strictly after from, seconds dropped", () => {
    expect(iso(next("* * * * *", at("2024-01-01T10:00:00Z")))).toEqual(["2024-01-01T10:01:00.000Z"]);
    expect(iso(next("* * * * *", at("2024-01-01T10:00:59.999Z")))).toEqual(["2024-01-01T10:01:00.000Z"]);
    expect(iso(next("* * * * *", at("2024-01-01T09:59:00.001Z"), 3))).toEqual([
      "2024-01-01T10:00:00.000Z",
      "2024-01-01T10:01:00.000Z",
      "2024-01-01T10:02:00.000Z",
    ]);
  });

  test("C9 a matching from is not returned", () => {
    expect(iso(next("@hourly", at("2024-01-01T10:00:00Z")))).toEqual(["2024-01-01T11:00:00.000Z"]);
    expect(iso(next("@hourly", at("2024-01-01T09:59:30Z")))).toEqual(["2024-01-01T10:00:00.000Z"]);
    expect(iso(next("30 9 * * *", at("2024-01-01T09:30:00Z")))).toEqual(["2024-01-02T09:30:00.000Z"]);
    expect(iso(next("30 9 * * *", at("2024-01-01T09:29:59Z")))).toEqual(["2024-01-01T09:30:00.000Z"]);
  });

  test("C9 returns Dates with zero seconds", () => {
    const [d] = next("* * * * *", at("2024-05-05T05:05:45.123Z"));
    expect(d).toBeInstanceOf(Date);
    expect(d!.getUTCSeconds()).toBe(0);
    expect(d!.getUTCMilliseconds()).toBe(0);
  });

  test("C9 count in increasing order across hours", () => {
    expect(iso(next("*/15 * * * *", at("2024-01-01T10:07:00Z"), 4))).toEqual([
      "2024-01-01T10:15:00.000Z",
      "2024-01-01T10:30:00.000Z",
      "2024-01-01T10:45:00.000Z",
      "2024-01-01T11:00:00.000Z",
    ]);
  });

  test("C9 rolls over days, months and years", () => {
    expect(iso(next("0 0 1 1 *", at("2024-12-31T23:59:00Z")))).toEqual(["2025-01-01T00:00:00.000Z"]);
    expect(iso(next("59 23 31 12 *", at("2024-12-31T23:59:00Z")))).toEqual(["2025-12-31T23:59:00.000Z"]);
    expect(iso(next("0 0 1 * *", at("2024-01-31T12:00:00Z"), 2))).toEqual([
      "2024-02-01T00:00:00.000Z",
      "2024-03-01T00:00:00.000Z",
    ]);
  });

  test("C8 weekday ranges and hour steps", () => {
    expect(iso(next("0 9-17/4 * * MON-FRI", at("2024-01-06T12:00:00Z"), 4))).toEqual([
      "2024-01-08T09:00:00.000Z",
      "2024-01-08T13:00:00.000Z",
      "2024-01-08T17:00:00.000Z",
      "2024-01-09T09:00:00.000Z",
    ]);
  });

  test("C8 both day fields restricted: either matches", () => {
    expect(iso(next("0 0 13 * FRI", at("2024-10-01T00:00:00Z"), 5))).toEqual([
      "2024-10-04T00:00:00.000Z",
      "2024-10-11T00:00:00.000Z",
      "2024-10-13T00:00:00.000Z",
      "2024-10-18T00:00:00.000Z",
      "2024-10-25T00:00:00.000Z",
    ]);
  });

  test("C8 a field starting with * makes both required", () => {
    expect(iso(next("0 0 */2 * FRI", at("2024-10-01T00:00:00Z"), 3))).toEqual([
      "2024-10-11T00:00:00.000Z",
      "2024-10-25T00:00:00.000Z",
      "2024-11-01T00:00:00.000Z",
    ]);
    expect(iso(next("0 0 13 * */1", at("2024-10-01T00:00:00Z")))).toEqual(["2024-10-13T00:00:00.000Z"]);
  });

  test("C8 a full range written out is still restricted", () => {
    expect(iso(next("0 0 1-31 * FRI", at("2024-10-01T00:00:00Z"), 2))).toEqual([
      "2024-10-02T00:00:00.000Z",
      "2024-10-03T00:00:00.000Z",
    ]);
    expect(iso(next("0 0 1 * 0-6", at("2024-10-01T00:00:00Z")))).toEqual(["2024-10-02T00:00:00.000Z"]);
  });

  test("C8 only one day field restricted", () => {
    expect(iso(next("0 0 13 * *", at("2024-10-01T00:00:00Z")))).toEqual(["2024-10-13T00:00:00.000Z"]);
    expect(iso(next("0 0 * * FRI", at("2024-10-01T00:00:00Z")))).toEqual(["2024-10-04T00:00:00.000Z"]);
    expect(iso(next("0 0 * * 7", at("2024-10-01T00:00:00Z")))).toEqual(["2024-10-06T00:00:00.000Z"]);
  });

  test("C10 the 31st skips short months", () => {
    expect(iso(next("0 0 31 * *", at("2024-04-01T00:00:00Z"), 3))).toEqual([
      "2024-05-31T00:00:00.000Z",
      "2024-07-31T00:00:00.000Z",
      "2024-08-31T00:00:00.000Z",
    ]);
    expect(iso(next("0 12 30 * *", at("2024-01-31T00:00:00Z")))).toEqual(["2024-03-30T12:00:00.000Z"]);
  });

  test("C10 29 February in leap years only", () => {
    expect(iso(next("0 0 29 2 *", at("2024-03-01T00:00:00Z")))).toEqual(["2028-02-29T00:00:00.000Z"]);
    expect(iso(next("0 0 29 2 *", at("1999-03-01T00:00:00Z")))).toEqual(["2000-02-29T00:00:00.000Z"]);
  });

  test("C10 2100 is not a leap year", () => {
    expect(iso(next("0 0 29 2 *", at("2097-03-01T00:00:00Z")))).toEqual(["2104-02-29T00:00:00.000Z"]);
  });

  test("C11 schedules that never fire", () => {
    cronFails(() => next("0 0 30 2 *", at("2024-01-01T00:00:00Z")), "schedule never fires");
    cronFails(() => next("0 0 31 4,6,9,11 *", at("2024-01-01T00:00:00Z")), "schedule never fires");
    cronFails(() => next("0 0 30 2 */7", at("2024-01-01T00:00:00Z")), "schedule never fires");
  });

  test("C11 rare is not never", () => {
    expect(iso(next("0 0 29 2 */7", at("2024-01-01T00:00:00Z")))).toEqual(["2032-02-29T00:00:00.000Z"]);
    expect(iso(next("0 0 30 2 MON", at("2024-01-01T00:00:00Z")))).toEqual(["2024-02-05T00:00:00.000Z"]);
  });

  test("C12 invalid from and count", () => {
    cronFails(() => next("* * * * *", new Date(Number.NaN)), "invalid date");
    cronFails(() => next("* * * * *", at("2024-01-01T00:00:00Z"), 0), "invalid count");
    cronFails(() => next("* * * * *", at("2024-01-01T00:00:00Z"), 1.5), "invalid count");
    cronFails(() => next("* * * * *", at("2024-01-01T00:00:00Z"), -1), "invalid count");
  });

  test("C12 the order of checks", () => {
    cronFails(() => next("bad", new Date(Number.NaN), 0), "expected 5 fields, got 1");
    cronFails(() => next("* * * * *", new Date(Number.NaN), 0), "invalid date");
    cronFails(() => next("0 0 30 2 *", at("2024-01-01T00:00:00Z"), 0), "invalid count");
  });

  test("C12 from is not modified", () => {
    const from = at("2024-01-01T10:00:30Z");
    next("* * * * *", from, 5);
    expect(from.toISOString()).toBe("2024-01-01T10:00:30.000Z");
  });

  test("C9 times before 1970", () => {
    expect(iso(next("* * * * *", at("1969-12-31T23:59:30Z")))).toEqual(["1970-01-01T00:00:00.000Z"]);
    expect(iso(next("0 0 1 1 *", at("1969-06-15T00:00:00Z")))).toEqual(["1970-01-01T00:00:00.000Z"]);
  });

  test("C8 C9 the local time zone is never used", () => {
    for (const tz of ["Asia/Kathmandu", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(iso(next("0 0 13 * FRI", at("2024-10-12T20:00:00Z"), 2))).toEqual([
        "2024-10-13T00:00:00.000Z",
        "2024-10-18T00:00:00.000Z",
      ]);
      expect(iso(next("30 23 31 * *", at("2024-11-30T23:00:00Z")))).toEqual(["2024-12-31T23:30:00.000Z"]);
    }
    process.env.TZ = originalTZ;
  });
  test("C9 a year of monthly times", () => {
    const ds = iso(next("@monthly", at("2024-01-01T00:00:00Z"), 12));
    expect(ds[0]).toBe("2024-02-01T00:00:00.000Z");
    expect(ds[11]).toBe("2025-01-01T00:00:00.000Z");
    expect(ds.length).toBe(12);
  });

  test("C8 a day list or a weekday", () => {
    expect(iso(next("0 6 1,15 * MON", at("2024-04-10T00:00:00Z"), 4))).toEqual([
      "2024-04-15T06:00:00.000Z",
      "2024-04-22T06:00:00.000Z",
      "2024-04-29T06:00:00.000Z",
      "2024-05-01T06:00:00.000Z",
    ]);
  });

  test("C10 the 31st of odd months", () => {
    expect(iso(next("0 0 31 1-12/2 *", at("2024-08-01T00:00:00Z")))).toEqual(["2025-01-31T00:00:00.000Z"]);
  });

  test("C9 every six hours with names in the month field", () => {
    expect(iso(next("0 */6 * feb *", at("2024-01-31T20:00:00Z"), 3))).toEqual([
      "2024-02-01T00:00:00.000Z",
      "2024-02-01T06:00:00.000Z",
      "2024-02-01T12:00:00.000Z",
    ]);
  });

  test("C9 a weekly macro on a Sunday", () => {
    expect(iso(next("@weekly", at("2024-10-06T00:00:00Z"), 2))).toEqual([
      "2024-10-13T00:00:00.000Z",
      "2024-10-20T00:00:00.000Z",
    ]);
  });
});
