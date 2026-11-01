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

export function parseCron(expr: string): CronSchedule {
  throw new Error("not implemented");
}

export function next(expr: string, from: Date, count = 1): Date[] {
  throw new Error("not implemented");
}
