import { ROUTINES } from "../public/routines.js";

export const ACTIVITIES = ["lift", "lower", "upper"] as const;
export type Activity = (typeof ACTIVITIES)[number];
export type CheckIns = Record<string, Activity[]>;
export type Times = Record<string, number>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SECONDS = 5;
const MAX_SECONDS = 600;

export function isDate(text: string) {
  return DATE.test(text) && !Number.isNaN(Date.parse(text + "T00:00:00Z"));
}

export function readActivities(body: unknown): { activities: Activity[] } | { error: string } {
  const list = (body as { activities?: unknown } | null)?.activities;
  if (!Array.isArray(list)) return { error: "activities must be a list." };
  const unknown = list.find((a) => !ACTIVITIES.includes(a));
  if (unknown !== undefined) return { error: `${JSON.stringify(unknown)} isn't lift, lower or upper.` };
  return { activities: ACTIVITIES.filter((a) => list.includes(a)) };
}

export function readTimes(body: unknown): { times: Times } | { error: string } {
  const times = (body as { times?: unknown } | null)?.times;
  if (!times || typeof times !== "object" || Array.isArray(times)) return { error: "times must be an object." };
  const known = stretchIds();
  for (const [id, seconds] of Object.entries(times)) {
    if (!known.has(id)) return { error: `${id} isn't a stretch.` };
    if (!isWholeSeconds(seconds)) return { error: `Times must be whole seconds from ${MIN_SECONDS} to ${MAX_SECONDS}.` };
  }
  return { times: times as Times };
}

export function checkInsBetween(checkIns: CheckIns, from: string, to: string): CheckIns {
  return Object.fromEntries(Object.entries(checkIns).filter(([date]) => date >= from && date <= to));
}

export function withDay(checkIns: CheckIns, date: string, activities: Activity[]): CheckIns {
  const { [date]: _old, ...rest } = checkIns;
  return activities.length ? { ...rest, [date]: activities } : rest;
}

function stretchIds() {
  return new Set(Object.values(ROUTINES).flatMap((routine) => routine.stretches.map((s) => s.id)));
}

function isWholeSeconds(value: unknown) {
  return Number.isInteger(value) && (value as number) >= MIN_SECONDS && (value as number) <= MAX_SECONDS;
}
