import { request } from "./api.js";
import { longDate, shortDate, today } from "./dates.js";
import { byId, element } from "./dom.js";
import { findLift, formatSets, REPS_LIMITS, TOP_REPS, WEIGHT_LIMITS } from "./lifts.js";
import { createRestTimer } from "./rest-timer.js";

const SAVE_DELAY_MS = 600;

export function createWorkoutScreen({ onCheckIn, onDone, onError }) {
  let date = null;
  let cards = [];
  let saveTimer = null;
  let saving = Promise.resolve();
  const rest = createRestTimer();

  async function open(newDate) {
    date = newDate;
    cards = [];
    renderHeading(newDate);
    byId("workout-lifts").replaceChildren();
    const workout = await request("GET", `/api/lifts/${newDate}`);
    if (date !== newDate) {
      return;
    }
    cards = workout.lifts.map((plan) => liftCard(plan, recordEntry));
    byId("workout-lifts").replaceChildren(...cards.map((card) => card.section));
  }

  function close() {
    saveNow();
    rest.stop();
    date = null;
    cards = [];
    return saving;
  }

  function recordEntry(card, finishedSet) {
    showCardState(card);
    if (finishedSet && date === today()) {
      rest.start();
    }
    byId("workout-status").textContent = "";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  function saveNow() {
    if (saveTimer === null) {
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = null;
    const forDate = date;
    const lifts = enteredLifts(cards);
    saving = saving.then(() => send(forDate, lifts));
  }

  async function send(forDate, lifts) {
    try {
      await request("PUT", `/api/lifts/${forDate}`, { lifts });
      showStatus(forDate, "Saved.");
    } catch (error) {
      showStatus(forDate, "Not saved yet. Change any number to try again.");
      onError(error);
    }
  }

  function showStatus(forDate, text) {
    if (forDate === date) {
      byId("workout-status").textContent = text;
    }
  }

  async function finish() {
    saveNow();
    await saving;
    onDone();
  }

  async function checkInOnly() {
    await onCheckIn();
    onDone();
  }

  function followVisibility() {
    if (document.visibilityState === "hidden") {
      saveNow();
    } else {
      rest.holdScreenAgain();
    }
  }

  byId("workout-done").addEventListener("click", () => finish().catch(onError));
  byId("workout-check-in").addEventListener("click", () => checkInOnly().catch(onError));
  document.addEventListener("visibilitychange", followVisibility);

  return { open, close };
}

function renderHeading(date) {
  byId("workout-date").textContent = longDate(date);
  byId("workout-status").textContent = "";
  byId("workout-check-in").hidden = date !== today();
}

function liftCard(plan, onEntry) {
  const lift = findLift(plan.id);
  const weight = weightInput(plan.weight);
  const sets = plan.reps.map((count, index) => repsInput(count, placeholderFor(plan, index)));
  const hint = element("p", {
    className: "error",
    textContent: "Enter a weight to save this lift.",
  });
  const card = { id: plan.id, weight, sets, hint };
  const changed = () => onEntry(card, false);
  card.section = element("section", { className: "card lift-card" }, [
    element("h2", { textContent: lift.name }),
    ...notesFor(lift, plan),
    weightRow(lift, weight, changed),
    setsRow(sets),
    hint,
  ]);
  weight.addEventListener("input", changed);
  for (const input of sets) {
    listenForSet(input, (finishedSet) => onEntry(card, finishedSet));
  }
  showCardState(card);
  return card;
}

function listenForSet(input, onChange) {
  let wasEmpty = input.value === "";
  input.addEventListener("input", () => {
    const finishedSet = wasEmpty && input.value !== "";
    wasEmpty = input.value === "";
    onChange(finishedSet);
  });
}

function notesFor(lift, plan) {
  const notes = [element("p", { className: "muted note", textContent: lastTimeText(lift, plan) })];
  if (plan.goUp) {
    const text = `${TOP_REPS} on every set last time, so it's up ${lift.step} lb.`;
    notes.push(element("p", { className: "go-up note", textContent: text }));
  }
  if (lift.eachLeg) {
    notes.push(element("p", { className: "muted note", textContent: "Reps are for each leg." }));
  }
  return notes;
}

function lastTimeText(lift, plan) {
  if (!plan.last) {
    return "First time logging this lift.";
  }
  return `Last time, ${shortDate(plan.last.date)}: ${formatSets(lift, plan.last)}`;
}

function weightInput(weight) {
  return element("input", {
    type: "number",
    inputMode: "decimal",
    value: weight === null ? "" : String(weight),
    placeholder: "0",
    ...WEIGHT_LIMITS,
  });
}

function weightRow(lift, input, onStep) {
  const unit = lift.bodyweight ? "lb added" : "lb";
  return element("div", { className: "weight-row" }, [
    stepButton(input, -lift.step, `${lift.step} lb less`, onStep),
    element("label", { className: "weight-field" }, [
      input,
      element("span", { className: "muted", textContent: unit }),
    ]),
    stepButton(input, lift.step, `${lift.step} lb more`, onStep),
  ]);
}

function stepButton(input, change, label, onStep) {
  const button = element("button", {
    type: "button",
    className: "icon-btn",
    textContent: change < 0 ? "−" : "+",
  });
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => {
    input.value = String(Math.max(0, (readNumber(input) ?? 0) + change));
    onStep();
  });
  return button;
}

function repsInput(count, placeholder) {
  return element("input", {
    type: "number",
    inputMode: "numeric",
    value: count === null ? "" : String(count),
    placeholder,
    ...REPS_LIMITS,
  });
}

function setsRow(inputs) {
  return element(
    "div",
    { className: "sets" },
    inputs.map((input, index) =>
      element("label", { className: "set" }, [
        element("span", { className: "muted", textContent: `Set ${index + 1}` }),
        input,
      ]),
    ),
  );
}

function placeholderFor(plan, index) {
  if (!plan.last || plan.goUp) {
    return "";
  }
  return String(plan.last.reps[index] ?? "");
}

function showCardState(card) {
  const reps = card.sets.map(readNumber);
  card.section.classList.toggle(
    "done",
    reps.every((count) => count !== null),
  );
  card.hint.hidden = readNumber(card.weight) !== null || reps.every((count) => count === null);
}

function enteredLifts(cards) {
  const lifts = {};
  for (const card of cards) {
    const weight = readNumber(card.weight);
    const reps = card.sets.map(readNumber);
    if (weight !== null && reps.some((count) => count !== null)) {
      lifts[card.id] = { weight, reps };
    }
  }
  return lifts;
}

function readNumber(input) {
  if (input.value === "" || !input.validity.valid) {
    return null;
  }
  return Number(input.value);
}
