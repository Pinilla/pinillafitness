import { byId, element, openDialog } from "./dom.js";
import { buildSteps } from "./routines.js";
import { startSession, updateSession, viewSession } from "./session.js";
import { playCue } from "./sound.js";

const TICK_MS = 200;
const COUNTDOWN_SECONDS = 3;

export function createStretchScreen({ onFinished, onQuit }) {
  let routineId = null;
  let session = null;
  let timer = null;
  let wakeLock = null;
  let pausedBeforeEnd = false;

  function start(id, times) {
    if (session && routineId === id) {
      return;
    }
    stop();
    routineId = id;
    session = startSession(buildSteps(id, times), Date.now());
    timer = setInterval(() => apply("tick"), TICK_MS);
    keepScreenOn();
    renderSession(session, viewSession(session, Date.now()));
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    session = null;
    releaseScreen();
  }

  function apply(action) {
    if (!session) {
      return;
    }
    const now = Date.now();
    const before = viewSession(session, now);
    session = updateSession(session, action, now);
    const after = viewSession(session, now);
    if (action === "tick") {
      signalChange(before, after);
    }
    if (after.phase === "done") {
      finish();
      return;
    }
    renderSession(session, after);
  }

  function finish() {
    const finishedId = routineId;
    stop();
    onFinished(finishedId);
  }

  function quit() {
    stop();
    onQuit();
  }

  function togglePause() {
    apply(isPaused() ? "resume" : "pause");
  }

  function askToEnd() {
    pausedBeforeEnd = isPaused();
    apply("pause");
    openDialog("end-dialog");
  }

  function answerEnd() {
    const choice = byId("end-dialog").returnValue;
    if (choice === "check-in") {
      finish();
    } else if (choice === "quit") {
      quit();
    } else if (!pausedBeforeEnd) {
      apply("resume");
    }
  }

  function isPaused() {
    return viewSession(session, Date.now()).paused;
  }

  async function keepScreenOn() {
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock = null;
    }
  }

  function releaseScreen() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function keepScreenOnAgain() {
    if (session) {
      keepScreenOn();
    }
  }

  byId("session-pause").addEventListener("click", togglePause);
  byId("session-skip").addEventListener("click", () => apply("skip"));
  byId("session-back").addEventListener("click", () => apply("back"));
  byId("session-end").addEventListener("click", askToEnd);
  byId("end-dialog").addEventListener("close", answerEnd);

  return { start, stop, keepScreenOnAgain };
}

function signalChange(before, after) {
  const cue = cueFor(before, after);
  if (cue) {
    playCue(cue);
  }
}

function cueFor(before, after) {
  if (after.phase === "done") {
    return "done";
  }
  if (before.number !== after.number) {
    return "next";
  }
  if (before.phase !== after.phase) {
    return "hold";
  }
  if (
    after.secondsLeft !== before.secondsLeft &&
    after.secondsLeft > 0 &&
    after.secondsLeft <= COUNTDOWN_SECONDS
  ) {
    return "countdown";
  }
  return null;
}

function renderSession(session, view) {
  byId("session-progress").textContent = `${view.number} of ${view.count}`;
  byId("session-phase").textContent = phaseText(view);
  byId("session-name").textContent = view.step.name;
  byId("session-side").textContent = view.step.side ?? "";
  byId("session-clock").textContent = clockText(view.secondsLeft);
  byId("session-pause").textContent = view.paused ? "Resume" : "Pause";
  byId("session").dataset.phase = view.paused ? "paused" : view.phase;
  byId("session-next").textContent = nextText(session.steps[view.number]);
  renderCues(view.step);
}

function phaseText(view) {
  if (view.paused) {
    return "Paused";
  }
  return view.phase === "ready" ? "Get ready" : "Hold";
}

function clockText(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function nextText(nextStep) {
  if (!nextStep) {
    return "Last one";
  }
  return nextStep.side
    ? `Next: ${nextStep.name}, ${nextStep.side.toLowerCase()}`
    : `Next: ${nextStep.name}`;
}

function renderCues(step) {
  const list = byId("session-cues");
  if (list.dataset.stretch === step.id) {
    return;
  }
  list.dataset.stretch = step.id;
  list.replaceChildren(...step.cues.map((cue) => element("li", { textContent: cue })));
}
