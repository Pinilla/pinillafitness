import { join } from "node:path";
import { isDate } from "../public/dates.js";
import {
  findLift,
  isAllowedReps,
  isAllowedWeight,
  LIFTS,
  SETS,
  TOP_REPS,
} from "../public/lifts.js";
import { openJsonFile, type JsonFile } from "./json-file.ts";

type Lift = (typeof LIFTS)[number];
type Reps = (number | null)[];
export type LiftLog = { weight: number; reps: Reps };
export type DayLifts = Record<string, LiftLog>;
export type LiftDays = Record<string, DayLifts>;
export type LastTime = LiftLog & { date: string };
export type LiftPlan = {
  id: string;
  weight: number | null;
  reps: Reps;
  last: LastTime | null;
  goUp: boolean;
};
export type LiftBook = {
  range(from: unknown, to: unknown): { lifts: LiftDays } | { error: string };
  workout(date: unknown): { lifts: LiftPlan[] } | { error: string };
  save(date: unknown, body: unknown): Promise<{ lifts: DayLifts } | { error: string }>;
};
type Options = { dir: string; checkIn(date: string): Promise<void> };

export async function openLifts({ dir, checkIn }: Options): Promise<LiftBook> {
  const file = await openJsonFile<LiftDays>(join(dir, "lifts.json"), {});

  return {
    range(from, to) {
      if (!isDate(from) || !isDate(to)) {
        return { error: "from and to must be YYYY-MM-DD dates." };
      }
      return { lifts: between(file.get(), from as string, to as string) };
    },
    workout(date) {
      if (!isDate(date)) {
        return { error: "That isn't a real date." };
      }
      return { lifts: LIFTS.map((lift) => planFor(lift, file.get(), date as string)) };
    },
    async save(date, body) {
      if (!isDate(date)) {
        return { error: "That isn't a real date." };
      }
      const read = readDay(body);
      if ("error" in read) {
        return read;
      }
      await replaceDay(file, date as string, read.lifts);
      if (Object.keys(read.lifts).length) {
        await checkIn(date as string);
      }
      return read;
    },
  };
}

function planFor(lift: Lift, days: LiftDays, date: string): LiftPlan {
  const logged = days[date]?.[lift.id];
  const last = lastTime(days, lift.id, date);
  return {
    id: lift.id,
    weight: logged?.weight ?? suggestedWeight(lift, last),
    reps: logged?.reps ?? emptySets(),
    last,
    goUp: last !== null && earnedRaise(last.reps),
  };
}

function lastTime(days: LiftDays, liftId: string, before: string): LastTime | null {
  const date = Object.keys(days)
    .filter((day) => day < before && days[day]![liftId])
    .sort()
    .at(-1);
  return date ? { date, ...days[date]![liftId]! } : null;
}

function suggestedWeight(lift: Lift, last: LastTime | null) {
  if (!last) {
    return lift.bodyweight ? 0 : null;
  }
  return earnedRaise(last.reps) ? last.weight + lift.step : last.weight;
}

function earnedRaise(reps: Reps) {
  return reps.length === SETS && reps.every((count) => count !== null && count >= TOP_REPS);
}

function emptySets(): Reps {
  return Array.from({ length: SETS }, () => null);
}

function readDay(body: unknown): { lifts: DayLifts } | { error: string } {
  const lifts = (body as { lifts?: unknown } | null)?.lifts;
  if (!lifts || typeof lifts !== "object" || Array.isArray(lifts)) {
    return { error: "lifts must be an object." };
  }
  const unknown = Object.keys(lifts).find((id) => !findLift(id));
  if (unknown !== undefined) {
    return { error: `${unknown} isn't a lift.` };
  }
  const read: DayLifts = {};
  for (const lift of LIFTS) {
    const log = readLog((lifts as Record<string, unknown>)[lift.id]);
    if ("error" in log) {
      return { error: `${lift.name}: ${log.error}` };
    }
    if (log.log) {
      read[lift.id] = log.log;
    }
  }
  return { lifts: read };
}

function readLog(value: unknown): { log: LiftLog | null } | { error: string } {
  if (value === undefined) {
    return { log: null };
  }
  const { weight, reps } = (value ?? {}) as { weight?: unknown; reps?: unknown };
  if (!isAllowedWeight(weight)) {
    return { error: "the weight must be 0 to 2000 lb, in quarter pounds." };
  }
  if (!Array.isArray(reps) || reps.length > SETS) {
    return { error: `reps must be a list of up to ${SETS} sets.` };
  }
  if (!reps.every((count) => count === null || isAllowedReps(count))) {
    return { error: "each set's reps must be a whole number from 0 to 99." };
  }
  return { log: hasReps(reps) ? { weight: weight as number, reps: padded(reps) } : null };
}

function hasReps(reps: Reps) {
  return reps.some((count) => count !== null);
}

function padded(reps: Reps): Reps {
  return [...reps, ...emptySets()].slice(0, SETS);
}

async function replaceDay(file: JsonFile<LiftDays>, date: string, lifts: DayLifts) {
  const { [date]: _replaced, ...rest } = file.get();
  await file.set(Object.keys(lifts).length ? { ...rest, [date]: lifts } : rest);
}

function between(days: LiftDays, from: string, to: string): LiftDays {
  return Object.fromEntries(Object.entries(days).filter(([date]) => date >= from && date <= to));
}
