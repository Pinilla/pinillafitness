export function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -mondayIndex(first));
  const weeks = [];
  for (let monday = start; monday.getMonth() === month || monday < first; monday = addDays(monday, 7)) {
    weeks.push(weekFrom(monday, month));
  }
  return weeks;
}

export function dayStatus(date, today, checkIns, first) {
  const activities = checkIns[date] ?? [];
  if (activities.length) return kindOf(activities);
  if (date >= today || first === null) return "open";
  return date >= first ? "missed" : "open";
}

export function countCheckIns(checkIns, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  return Object.entries(checkIns).filter(([date, list]) => date.startsWith(prefix) && list.length).length;
}

function weekFrom(monday, month) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date: isoDate(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}

function kindOf(activities) {
  const lifted = activities.includes("lift");
  const stretched = activities.includes("lower") || activities.includes("upper");
  if (lifted && stretched) return "both";
  return lifted ? "lift" : "stretch";
}

function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
