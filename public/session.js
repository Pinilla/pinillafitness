export function startSession(steps, now) {
  return beginStep(steps, 0, now);
}

export function updateSession(state, action, now) {
  if (state.phase === "done") {
    return state;
  }
  switch (action) {
    case "tick":
      return catchUp(state, now);
    case "pause":
      return pause(state, now);
    case "resume":
      return resume(state, now);
    case "skip":
      return beginStep(state.steps, state.index + 1, now);
    case "back":
      return beginStep(state.steps, Math.max(0, state.index - 1), now);
    default:
      throw new Error(`Unknown session action ${action}`);
  }
}

export function viewSession(state, now) {
  const step = state.steps[Math.min(state.index, state.steps.length - 1)];
  return {
    step,
    number: state.index + 1,
    count: state.steps.length,
    phase: state.phase,
    paused: state.pausedLeft !== null,
    secondsLeft: Math.ceil(millisecondsLeft(state, now) / 1000),
  };
}

function beginStep(steps, index, now) {
  if (index >= steps.length) {
    return { steps, index: steps.length, phase: "done", endsAt: null, pausedLeft: null };
  }
  return {
    steps,
    index,
    phase: "ready",
    endsAt: now + steps[index].getReady * 1000,
    pausedLeft: null,
  };
}

function catchUp(state, now) {
  let next = state;
  while (next.phase !== "done" && next.pausedLeft === null && now >= next.endsAt) {
    next = advance(next);
  }
  return next;
}

function advance(state) {
  if (state.phase === "ready") {
    return { ...state, phase: "hold", endsAt: state.endsAt + state.steps[state.index].hold * 1000 };
  }
  return beginStep(state.steps, state.index + 1, state.endsAt);
}

function pause(state, now) {
  if (state.pausedLeft !== null) {
    return state;
  }
  return { ...state, pausedLeft: Math.max(0, state.endsAt - now), endsAt: null };
}

function resume(state, now) {
  if (state.pausedLeft === null) {
    return state;
  }
  return { ...state, endsAt: now + state.pausedLeft, pausedLeft: null };
}

function millisecondsLeft(state, now) {
  if (state.phase === "done") {
    return 0;
  }
  if (state.pausedLeft !== null) {
    return state.pausedLeft;
  }
  return Math.max(0, state.endsAt - now);
}
