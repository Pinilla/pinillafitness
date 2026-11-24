import { test } from "node:test";
import assert from "node:assert/strict";
import { startSession, updateSession, viewSession } from "../public/session.js";

const steps = [
  { id: "a", name: "A", cues: [], side: null, getReady: 10, hold: 60 },
  { id: "b", name: "B", cues: [], side: "Left side", getReady: 5, hold: 30 },
];

function at(state: unknown, ms: number) {
  const ticked = updateSession(state, "tick", ms);
  return { state: ticked, view: viewSession(ticked, ms) };
}

test("a session starts on the first stretch's get-ready countdown", () => {
  const view = viewSession(startSession(steps, 0), 0);
  assert.deepEqual([view.number, view.phase, view.secondsLeft], [1, "ready", 10]);
});

test("the hold starts when the get-ready countdown ends", () => {
  const { view } = at(startSession(steps, 0), 10_000);
  assert.deepEqual([view.number, view.phase, view.secondsLeft], [1, "hold", 60]);
});

test("the next stretch's get-ready starts when the hold ends", () => {
  const { view } = at(startSession(steps, 0), 70_500);
  assert.deepEqual([view.number, view.phase, view.secondsLeft], [2, "ready", 5]);
});

test("a late tick catches up through every phase it missed", () => {
  const { view } = at(startSession(steps, 0), 80_000);
  assert.deepEqual([view.number, view.phase, view.secondsLeft], [2, "hold", 25]);
});

test("the session is done after the last hold", () => {
  assert.equal(at(startSession(steps, 0), 105_000).view.phase, "done");
});

test("pausing freezes the countdown until resumed", () => {
  let state = updateSession(startSession(steps, 0), "pause", 4_000);
  state = updateSession(state, "tick", 50_000);
  assert.deepEqual([viewSession(state, 50_000).paused, viewSession(state, 50_000).secondsLeft], [true, 6]);
  state = updateSession(state, "resume", 50_000);
  assert.equal(at(state, 56_000).view.phase, "hold");
});

test("skip goes to the next stretch's get-ready, and back returns to the one before", () => {
  const skipped = updateSession(startSession(steps, 0), "skip", 3_000);
  assert.deepEqual([viewSession(skipped, 3_000).number, viewSession(skipped, 3_000).phase], [2, "ready"]);
  const back = updateSession(skipped, "back", 4_000);
  assert.deepEqual([viewSession(back, 4_000).number, viewSession(back, 4_000).secondsLeft], [1, 10]);
});

test("back on the first stretch restarts it", () => {
  const state = updateSession(at(startSession(steps, 0), 30_000).state, "back", 30_000);
  assert.deepEqual([viewSession(state, 30_000).phase, viewSession(state, 30_000).secondsLeft], ["ready", 10]);
});

test("finish ends the session early", () => {
  assert.equal(updateSession(startSession(steps, 0), "finish", 1_000).phase, "done");
});
