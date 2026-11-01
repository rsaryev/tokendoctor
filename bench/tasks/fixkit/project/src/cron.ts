// Five-field cron expressions in UTC. See README.md, "cron".

export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronError";
  }
}

export interface CronSchedule {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
  dayOfMonthStar: boolean;
  dayOfWeekStar: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Field {
  name: string;
  min: number;
  max: number;
  // The end of "*" and of "v/step".
  top: number;
  names: string[] | null;
  base: number;
}

const FIELDS: Field[] = [
  { name: "minute", min: 0, max: 59, top: 59, names: null, base: 0 },
  { name: "hour", min: 0, max: 23, top: 23, names: null, base: 0 },
  { name: "day-of-month", min: 1, max: 31, top: 31, names: null, base: 0 },
  { name: "month", min: 1, max: 12, top: 12, names: MONTHS, base: 1 },
  { name: "day-of-week", min: 0, max: 7, top: 6, names: DAYS, base: 0 },
];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

function parseField(text: string, f: Field): number[] {
  const bad = (): never => {
    throw new CronError(`invalid ${f.name} field "${text}"`);
  };
  const value = (s: string): number => {
    if (/^[0-9]+$/.test(s)) {
      const v = Number(s);
      if (v < f.min || v > f.max) bad();
      return v;
    }
    if (f.names && /^[A-Za-z]{3}$/.test(s)) {
      const i = f.names.indexOf(s.toUpperCase());
      if (i < 0) bad();
      return i + f.base;
    }
    return bad();
  };
  const set = new Set<number>();
  for (const item of text.split(",")) {
    const m = /^([^/]+)(?:\/([0-9]+))?$/.exec(item);
    if (!m) bad();
    const [, range, stepText] = m!;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (step < 1) bad();
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = f.min;
      hi = f.top;
    } else if (range!.includes("-")) {
      const parts = range!.split("-");
      if (parts.length !== 2) bad();
      lo = value(parts[0]!);
      hi = value(parts[1]!);
      if (lo > hi) bad();
    } else {
      lo = value(range!);
      hi = lo;
      if (lo > hi) bad();
    }
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

export function parseCron(expr: string): CronSchedule {
  let text = expr.trim();
  if (text.startsWith("@")) {
    const macro = MACROS[text.toLowerCase()];
    if (macro === undefined) throw new CronError(`unknown macro "${text}"`);
    text = macro;
  }
  const parts = text === "" ? [] : text.split(/[ \t]+/);
  if (parts.length !== 5) throw new CronError(`expected 5 fields, got ${parts.length}`);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map((p, i) => parseField(p, FIELDS[i]!));
  return {
    minute: minute!,
    hour: hour!,
    dayOfMonth: dayOfMonth!,
    month: month!,
    dayOfWeek: dayOfWeek!,
    dayOfMonthStar: parts[2]!.startsWith("*"),
    dayOfWeekStar: parts[4]!.startsWith("*"),
  };
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const SEARCH_DAYS = 146_097;

function dayMatches(s: CronSchedule, d: Date): boolean {
  if (!s.month.includes(d.getUTCMonth() + 1)) return false;
  const dom = s.dayOfMonth.includes(d.getUTCDate());
  const dow = s.dayOfWeek.includes(d.getUTCDay());
  return s.dayOfMonthStar || s.dayOfWeekStar ? dom || dow : dom && dow;
}

function after(s: CronSchedule, t0: number): number {
  const startDay = Math.floor(t0 / DAY) * DAY;
  for (let k = 0; k <= SEARCH_DAYS; k++) {
    const day = startDay + k * DAY;
    if (!dayMatches(s, new Date(day))) continue;
    for (const h of s.hour) {
      for (const m of s.minute) {
        const t = day + h * 3_600_000 + m * MINUTE;
        if (t >= t0) return t;
      }
    }
  }
  throw new CronError("schedule never fires");
}

export function next(expr: string, from: Date, count = 1): Date[] {
  const s = parseCron(expr);
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) throw new CronError("invalid date");
  if (!Number.isInteger(count) || count < 1) throw new CronError("invalid count");
  const out: Date[] = [];
  let t0 = Math.floor(from.getTime() / MINUTE) * MINUTE + MINUTE;
  for (let i = 0; i < count; i++) {
    const t = after(s, t0);
    out.push(new Date(t));
    t0 = t + MINUTE;
  }
  return out;
}
