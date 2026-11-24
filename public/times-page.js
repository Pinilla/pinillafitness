import { request } from "./api.js";
import { byId, element } from "./dom.js";
import { DEFAULT_SECONDS, HOLD_LIMITS, ROUTINES } from "./routines.js";
import { showToast } from "./toast.js";

export function createTimesPage({ getTimes, onSaved, onError }) {
  function render() {
    byId("times-list").replaceChildren(
      ...Object.values(ROUTINES).map((routine) => routineFields(routine, getTimes())),
    );
  }

  async function save(event) {
    event.preventDefault();
    const times = await request("PUT", "/api/times", { times: enteredTimes() });
    showToast("Saved.");
    onSaved(times.times);
  }

  byId("times-form").addEventListener("submit", (event) => save(event).catch(onError));

  return { render };
}

function routineFields(routine, times) {
  const legend = element("legend", { textContent: routine.name });
  return element("fieldset", {}, [
    legend,
    ...routine.stretches.map((stretch) => timeField(stretch, times)),
  ]);
}

function timeField(stretch, times) {
  return element("label", { className: "time-field" }, [
    element("span", { textContent: stretch.name }),
    secondsInput(stretch.id, times[stretch.id] ?? DEFAULT_SECONDS),
    element("span", { className: "muted", textContent: stretch.sides ? "sec each side" : "sec" }),
  ]);
}

function secondsInput(name, seconds) {
  return element("input", {
    type: "number",
    name,
    value: String(seconds),
    required: true,
    inputMode: "numeric",
    ...HOLD_LIMITS,
  });
}

function enteredTimes() {
  const inputs = [...byId("times-form").querySelectorAll("input")];
  return Object.fromEntries(inputs.map((input) => [input.name, Number(input.value)]));
}
