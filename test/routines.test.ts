import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSteps, routineSeconds } from "../public/routines.js";

test("one-sided stretches get a step for each side, with a shorter get-ready for the second side", () => {
  const pigeon = buildSteps("lower", {}).filter((step) => step.id === "pigeon");
  assert.deepEqual(pigeon.map((s) => [s.side, s.getReady, s.hold]), [["Left side", 10, 60], ["Right side", 5, 60]]);
});

test("the lower body routine runs butterfly, straddle, then both sides of pigeon, lunge and splits", () => {
  assert.deepEqual(buildSteps("lower", {}).map((s) => s.id), ["butterfly", "straddle", "pigeon", "pigeon", "lunge", "lunge", "splits", "splits"]);
});

test("a saved time replaces the default hold for that stretch only", () => {
  const steps = buildSteps("upper", { "wall-angels": 45 });
  assert.equal(steps.find((s) => s.id === "wall-angels").hold, 45);
  assert.equal(steps.find((s) => s.id === "chin-tucks").hold, 60);
});

test("a routine's length counts every hold and every get-ready", () => {
  assert.equal(routineSeconds("upper", {}), 5 * (10 + 60));
  assert.equal(routineSeconds("lower", {}), 5 * 10 + 3 * 5 + 8 * 60);
});
