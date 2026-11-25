import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSteps, routineSeconds } from "../public/routines.js";

test("each stretch runs twice, with a 30-second rest before the second set", () => {
  const butterfly = buildSteps("lower", {}).filter((step) => step.id === "butterfly");
  assert.deepEqual(
    butterfly.map((s) => [s.set, s.rest, s.getReady, s.hold]),
    [
      [1, false, 10, 60],
      [2, true, 30, 60],
    ],
  );
});

test("one-sided stretches do both sides in each set, with a shorter get-ready for the second side", () => {
  const pigeon = buildSteps("lower", {}).filter((step) => step.id === "pigeon");
  assert.deepEqual(
    pigeon.map((s) => [s.set, s.side, s.getReady]),
    [
      [1, "Left side", 10],
      [1, "Right side", 5],
      [2, "Left side", 30],
      [2, "Right side", 5],
    ],
  );
});

test("the lower body routine finishes both sets of a stretch before moving to the next", () => {
  assert.deepEqual(
    buildSteps("lower", {}).map((s) => s.id),
    [
      ...Array(2).fill("butterfly"),
      ...Array(2).fill("straddle"),
      ...Array(4).fill("pigeon"),
      ...Array(4).fill("lunge"),
      ...Array(4).fill("splits"),
    ],
  );
});

test("a saved time replaces the default hold for both sets of that stretch only", () => {
  const steps = buildSteps("upper", { "wall-angels": 45 });
  assert.deepEqual(
    steps.filter((s) => s.id === "wall-angels").map((s) => s.hold),
    [45, 45],
  );
  assert.equal(steps.find((s) => s.id === "chin-tucks").hold, 60);
});

test("a routine's length counts every hold, get-ready and rest", () => {
  assert.equal(routineSeconds("upper", {}), 5 * (10 + 30) + 10 * 60);
  assert.equal(routineSeconds("lower", {}), 5 * (10 + 30) + 6 * 5 + 16 * 60);
});
