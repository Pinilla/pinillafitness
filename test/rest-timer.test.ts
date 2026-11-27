import { test } from "node:test";
import assert from "node:assert/strict";
import { restCue } from "../public/rest-timer.js";

test("the rest beeps once for each of its last three seconds", () => {
  assert.deepEqual(
    [
      [5, 4],
      [4, 3],
      [3, 2],
      [2, 1],
    ].map(([before, after]) => restCue(before, after, -1000)),
    [null, "countdown", "countdown", "countdown"],
  );
});

test("the end of the rest signals once, as it happens", () => {
  assert.equal(restCue(1, 0, 100), "hold");
  assert.equal(restCue(0, 0, 400), null);
});

test("a rest that ended while the phone was asleep stays quiet", () => {
  assert.equal(restCue(40, 0, 60_000), null);
});
