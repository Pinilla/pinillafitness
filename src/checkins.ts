import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { isDate } from "../public/dates.js";
import { openJsonFile, type JsonFile } from "./json-file.ts";

export const ACTIVITIES = ["lift", "lower", "upper"] as const;
export type Activity = (typeof ACTIVITIES)[number];
export type CheckIns = Record<string, Activity[]>;
export type CheckInBook = {
  range(
    from: unknown,
    to: unknown,
  ): { checkIns: CheckIns; first: string | null } | { error: string };
  save(date: string, body: unknown): Promise<{ activities: Activity[] } | { error: string }>;
  add(date: string, activity: Activity): Promise<void>;
  isCheckedIn(date: string): boolean;
};

export async function openCheckIns(dir: string): Promise<CheckInBook> {
  const file = await openJsonFile<CheckIns>(join(dir, "checkins.json"), {});
  const changeLog = join(dir, "changes.jsonl");

  return {
    range(from, to) {
      if (!isDate(from) || !isDate(to)) {
        return { error: "from and to must be YYYY-MM-DD dates." };
      }
      return {
        checkIns: between(file.get(), from as string, to as string),
        first: firstDate(file.get()),
      };
    },
    async save(date, body) {
      if (!isDate(date)) {
        return { error: "That isn't a real date." };
      }
      const read = readActivities(body);
      if ("error" in read) {
        return read;
      }
      await replaceDay(file, changeLog, date, read.activities);
      return read;
    },
    async add(date, activity) {
      const current = file.get()[date] ?? [];
      if (!current.includes(activity)) {
        await replaceDay(file, changeLog, date, withActivity(current, activity));
      }
    },
    isCheckedIn(date) {
      return (file.get()[date]?.length ?? 0) > 0;
    },
  };
}

async function replaceDay(
  file: JsonFile<CheckIns>,
  changeLog: string,
  date: string,
  activities: Activity[],
) {
  const before = file.get()[date] ?? [];
  await file.set(withDay(file.get(), date, activities));
  await logChange(changeLog, date, before, activities);
}

function readActivities(body: unknown): { activities: Activity[] } | { error: string } {
  const list = (body as { activities?: unknown } | null)?.activities;
  if (!Array.isArray(list)) {
    return { error: "activities must be a list." };
  }
  const unknown = list.find((activity) => !ACTIVITIES.includes(activity));
  if (unknown !== undefined) {
    return { error: `${JSON.stringify(unknown)} isn't lift, lower or upper.` };
  }
  return { activities: ACTIVITIES.filter((activity) => list.includes(activity)) };
}

function withActivity(activities: Activity[], added: Activity) {
  return ACTIVITIES.filter((activity) => activity === added || activities.includes(activity));
}

function between(checkIns: CheckIns, from: string, to: string): CheckIns {
  return Object.fromEntries(
    Object.entries(checkIns).filter(([date]) => date >= from && date <= to),
  );
}

function firstDate(checkIns: CheckIns) {
  return Object.keys(checkIns).sort()[0] ?? null;
}

function withDay(checkIns: CheckIns, date: string, activities: Activity[]): CheckIns {
  const { [date]: _replaced, ...rest } = checkIns;
  return activities.length ? { ...rest, [date]: activities } : rest;
}

async function logChange(path: string, date: string, before: Activity[], after: Activity[]) {
  const line = JSON.stringify({ at: new Date().toISOString(), date, before, after });
  await appendFile(path, line + "\n");
}
