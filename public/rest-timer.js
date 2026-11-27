import { minutesAndSeconds } from "./dates.js";
import { byId } from "./dom.js";
import { REST_SECONDS } from "./lifts.js";
import { createScreenLock } from "./screen-lock.js";
import { playCue } from "./sound.js";

const TICK_MS = 200;
const COUNTDOWN_SECONDS = 3;
const LATE_CUE_MS = 2000;
const SHOWN_AFTER_END_MS = 5 * 60_000;

export function createRestTimer() {
  const screen = createScreenLock();
  let endsAt = null;
  let secondsLeft = null;
  let timer = null;

  function start() {
    endsAt = Date.now() + REST_SECONDS * 1000;
    secondsLeft = REST_SECONDS;
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
    screen.hold();
    render();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    endsAt = null;
    screen.release();
    byId("workout-rest").hidden = true;
  }

  function tick() {
    const now = Date.now();
    if (now > endsAt + SHOWN_AFTER_END_MS) {
      stop();
      return;
    }
    const before = secondsLeft;
    secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
    const cue = restCue(before, secondsLeft, now - endsAt);
    if (cue) {
      playCue(cue);
    }
    if (secondsLeft === 0) {
      screen.release();
    }
    render();
  }

  function render() {
    const box = byId("workout-rest");
    box.hidden = false;
    box.classList.toggle("over", secondsLeft === 0);
    box.textContent =
      secondsLeft === 0 ? "Time for your next set" : `Rest ${minutesAndSeconds(secondsLeft)}`;
  }

  return { start, stop, holdScreenAgain: screen.holdAgain };
}

export function restCue(before, after, msSinceEnd) {
  if (before === after) {
    return null;
  }
  if (after === 0) {
    return msSinceEnd < LATE_CUE_MS ? "hold" : null;
  }
  return after <= COUNTDOWN_SECONDS ? "countdown" : null;
}
