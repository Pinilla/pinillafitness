import { addDays, isoDate } from "./dates.js";

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const weeks = [];
  for (
    let monday = mondayOnOrBefore(first);
    startsInMonth(monday, first);
    monday = addDays(monday, 7)
  ) {
    weeks.push(weekFrom(monday, month));
  }
  return weeks;
}

export function dayStatus(date, today, checkIns, first) {
  const activities = checkIns[date] ?? [];
  if (activities.length) {
    return kindOf(activities);
  }
  if (date >= today || first === null || date < first) {
    return "open";
  }
  return "missed";
}

export function countCheckIns(checkIns, year, month) {
  const prefix = isoDate(new Date(year, month, 1)).slice(0, 8);
  return Object.entries(checkIns).filter(
    ([date, activities]) => date.startsWith(prefix) && activities.length,
  ).length;
}

function mondayOnOrBefore(date) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

function startsInMonth(monday, first) {
  return monday < first || monday.getMonth() === first.getMonth();
}

function weekFrom(monday, month) {
  return Array.from({ length: 7 }, (_, index) => dayCell(addDays(monday, index), month));
}

function dayCell(date, month) {
  return { date: isoDate(date), day: date.getDate(), inMonth: date.getMonth() === month };
}

function kindOf(activities) {
  const lifted = activities.includes("lift");
  const stretched = activities.includes("lower") || activities.includes("upper");
  if (lifted && stretched) {
    return "both";
  }
  return lifted ? "lift" : "stretch";
}
