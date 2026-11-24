import { request } from "./api.js";
import { countCheckIns, dayStatus, monthGrid } from "./calendar.js";
import { fromIsoDate, isoDate } from "./dates.js";
import { byId, element, openDialog } from "./dom.js";
import { ROUTINES, routineSeconds } from "./routines.js";
import { showToast } from "./toast.js";

const ACTIVITY_NAMES = { lift: "lift", lower: "lower body stretch", upper: "upper body stretch" };

export function createHome({ getTimes, onError }) {
  let checkIns = {};
  let first = null;
  let month = currentMonth();
  let openDate = null;

  async function load() {
    const { from, to } = loadRange(month);
    const data = await request("GET", `/api/checkins?from=${from}&to=${to}`);
    checkIns = { ...outsideRange(checkIns, from, to), ...data.checkIns };
    first = data.first;
  }

  function render() {
    renderToday(activitiesOn(today()));
    renderCalendar();
    renderRoutineLengths(getTimes());
  }

  async function checkInToday(activity) {
    const current = activitiesOn(today());
    if (!current.includes(activity)) {
      await saveDay(today(), [...current, activity]);
    }
  }

  async function saveDay(date, activities) {
    await request("PUT", `/api/checkins/${date}`, { activities });
    await load();
    render();
  }

  async function toggleLift() {
    const current = activitiesOn(today());
    const lifted = current.includes("lift");
    await saveDay(
      today(),
      lifted ? current.filter((activity) => activity !== "lift") : [...current, "lift"],
    );
    showToast(lifted ? "Removed today's lift." : "Checked in: lift.");
  }

  async function moveMonth(by) {
    const date = new Date(month.year, month.month + by, 1);
    month = { year: date.getFullYear(), month: date.getMonth() };
    renderCalendar();
    await load();
    renderCalendar();
  }

  function renderCalendar() {
    const { year, month: monthIndex } = month;
    byId("month-label").textContent = new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    const days = monthGrid(year, monthIndex)
      .flat()
      .map((cell) => dayButton(cell));
    byId("calendar").replaceChildren(...days);
    byId("month-count").textContent = monthCountText(countCheckIns(checkIns, year, monthIndex));
  }

  function dayButton(cell) {
    const button = element("button", {
      type: "button",
      className: `day ${dayStatus(cell.date, today(), checkIns, first)}`,
      textContent: String(cell.day),
      disabled: cell.date > today(),
    });
    button.classList.toggle("outside", !cell.inMonth);
    button.classList.toggle("today", cell.date === today());
    button.setAttribute(
      "aria-label",
      `${longDate(cell.date)}. ${describeActivities(activitiesOn(cell.date))}`,
    );
    button.addEventListener("click", () => openDay(cell.date));
    return button;
  }

  function openDay(date) {
    openDate = date;
    byId("day-title").textContent = longDate(date);
    for (const box of dayCheckboxes()) {
      box.checked = activitiesOn(date).includes(box.value);
    }
    openDialog("day-dialog");
  }

  async function saveOpenDay() {
    if (byId("day-dialog").returnValue !== "save") {
      return;
    }
    const checked = dayCheckboxes()
      .filter((box) => box.checked)
      .map((box) => box.value);
    await saveDay(openDate, checked);
    showToast("Saved.");
  }

  function activitiesOn(date) {
    return checkIns[date] ?? [];
  }

  function safely(handler) {
    return (...args) => Promise.resolve(handler(...args)).catch(onError);
  }

  byId("lift").addEventListener("click", safely(toggleLift));
  byId("stretch").addEventListener("click", toggleRoutines);
  byId("prev-month").addEventListener(
    "click",
    safely(() => moveMonth(-1)),
  );
  byId("next-month").addEventListener(
    "click",
    safely(() => moveMonth(1)),
  );
  byId("day-dialog").addEventListener("close", safely(saveOpenDay));

  return { load, render, checkInToday };
}

function renderToday(activities) {
  byId("today-label").textContent = longDate(today());
  byId("today-status").textContent = describeActivities(activities);
  byId("lift").setAttribute("aria-pressed", String(activities.includes("lift")));
  byId("stretch").classList.toggle(
    "done",
    activities.includes("lower") || activities.includes("upper"),
  );
}

function renderRoutineLengths(times) {
  for (const id of Object.keys(ROUTINES)) {
    const minutes = Math.round(routineSeconds(id, times) / 60);
    document.querySelector(`[data-length="${id}"]`).textContent = `about ${minutes} min`;
  }
}

function toggleRoutines() {
  const opening = byId("routines").hidden;
  byId("routines").hidden = !opening;
  byId("stretch").setAttribute("aria-expanded", String(opening));
}

function dayCheckboxes() {
  return [...byId("day-form").elements.activity];
}

function describeActivities(activities) {
  if (!activities.length) {
    return "Not checked in yet.";
  }
  const text = joinWords(activities.map((activity) => ACTIVITY_NAMES[activity]));
  return `Checked in: ${text[0].toUpperCase()}${text.slice(1)}.`;
}

function joinWords(words) {
  if (words.length < 2) {
    return words.join("");
  }
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function monthCountText(count) {
  return count === 1 ? "Checked in 1 day this month." : `Checked in ${count} days this month.`;
}

function loadRange(month) {
  const days = monthGrid(month.year, month.month).flat();
  const from = days[0].date < today() ? days[0].date : today();
  const to = days.at(-1).date > today() ? days.at(-1).date : today();
  return { from, to };
}

function outsideRange(checkIns, from, to) {
  return Object.fromEntries(Object.entries(checkIns).filter(([date]) => date < from || date > to));
}

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function today() {
  return isoDate(new Date());
}

function longDate(date) {
  return fromIsoDate(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
