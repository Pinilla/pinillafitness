import type { CheckIns } from "./checkins.ts";

export const REMINDER_HOUR = 22;

export function reminderDue(now: Date, checkIns: CheckIns, lastReminded: string | null): string | null {
  const today = localDate(now);
  if (now.getHours() < REMINDER_HOUR) return null;
  if (lastReminded === today) return null;
  if (checkIns[today]?.length) return null;
  return today;
}

function localDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
