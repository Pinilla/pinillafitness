const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isDate(text) {
  if (typeof text !== "string" || !DATE_PATTERN.test(text)) {
    return false;
  }
  return isoDate(fromIsoDate(text)) === text;
}

export function fromIsoDate(text) {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function today() {
  return isoDate(new Date());
}

export function longDate(text) {
  return fromIsoDate(text).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function shortDate(text) {
  return fromIsoDate(text).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function minutesAndSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
