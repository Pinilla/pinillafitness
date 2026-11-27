import { test } from "node:test";
import assert from "node:assert/strict";
import { openLifts, type LiftBook } from "../src/lifts.ts";
import { withTempDir } from "./helpers.ts";

type Book = { lifts: LiftBook; checkedIn: string[] };

async function withLifts(run: (book: Book) => Promise<void>) {
  await withTempDir(async (dir) => {
    const checkedIn: string[] = [];
    const lifts = await openLifts({ dir, checkIn: async (date) => void checkedIn.push(date) });
    await run({ lifts, checkedIn });
  });
}

function planOf(lifts: LiftBook, date: string, id: string) {
  const workout = lifts.workout(date);
  assert.ok("lifts" in workout);
  return workout.lifts.find((plan) => plan.id === id)!;
}

test("seven reps on all three sets raises the next weight by the lift's step", async () => {
  await withLifts(async ({ lifts }) => {
    await lifts.save("2026-11-24", { lifts: { "bench-press": { weight: 135, reps: [7, 7, 7] } } });
    const plan = planOf(lifts, "2026-11-26", "bench-press");
    assert.equal(plan.weight, 140);
    assert.equal(plan.goUp, true);
  });
});

test("a set under seven reps keeps the same weight next time", async () => {
  await withLifts(async ({ lifts }) => {
    await lifts.save("2026-11-24", { lifts: { "bench-press": { weight: 135, reps: [7, 7, 6] } } });
    const plan = planOf(lifts, "2026-11-26", "bench-press");
    assert.equal(plan.weight, 135);
    assert.equal(plan.goUp, false);
  });
});

test("a missing set keeps the same weight next time", async () => {
  await withLifts(async ({ lifts }) => {
    await lifts.save("2026-11-24", { lifts: { "bench-press": { weight: 135, reps: [8, 8] } } });
    assert.equal(planOf(lifts, "2026-11-26", "bench-press").weight, 135);
  });
});

test("last time is the latest earlier day with that lift", async () => {
  await withLifts(async ({ lifts }) => {
    await lifts.save("2026-11-20", { lifts: { "hip-thrusts": { weight: 185, reps: [7, 7, 7] } } });
    await lifts.save("2026-11-22", { lifts: { "bench-press": { weight: 135, reps: [5, 5, 5] } } });
    await lifts.save("2026-11-28", { lifts: { "hip-thrusts": { weight: 200, reps: [6, 6, 6] } } });
    const plan = planOf(lifts, "2026-11-24", "hip-thrusts");
    assert.deepEqual(plan.last, { date: "2026-11-20", weight: 185, reps: [7, 7, 7] });
  });
});

test("a day's own log shows instead of the suggestion", async () => {
  await withLifts(async ({ lifts }) => {
    await lifts.save("2026-11-24", { lifts: { "bench-press": { weight: 135, reps: [7, 7, 7] } } });
    await lifts.save("2026-11-26", { lifts: { "bench-press": { weight: 135, reps: [8] } } });
    const plan = planOf(lifts, "2026-11-26", "bench-press");
    assert.deepEqual([plan.weight, plan.reps], [135, [8, null, null]]);
  });
});

test("a lift never logged has no weight, except a bodyweight lift, which starts at zero added", async () => {
  await withLifts(async ({ lifts }) => {
    assert.equal(planOf(lifts, "2026-11-26", "bench-press").weight, null);
    assert.equal(planOf(lifts, "2026-11-26", "pull-ups").weight, 0);
  });
});

test("a lift with no reps entered isn't saved", async () => {
  await withLifts(async ({ lifts }) => {
    const saved = await lifts.save("2026-11-26", {
      lifts: { "bench-press": { weight: 135, reps: [null, null, null] } },
    });
    assert.deepEqual(saved, { lifts: {} });
    assert.deepEqual(lifts.range("2026-11-01", "2026-11-30"), { lifts: {} });
  });
});

test("saving a lift checks in the day, and saving nothing doesn't", async () => {
  await withLifts(async ({ lifts, checkedIn }) => {
    await lifts.save("2026-11-25", { lifts: {} });
    await lifts.save("2026-11-26", { lifts: { "pull-ups": { weight: 0, reps: [6] } } });
    assert.deepEqual(checkedIn, ["2026-11-26"]);
  });
});

test("an unknown lift is refused", async () => {
  await withLifts(async ({ lifts }) => {
    const saved = await lifts.save("2026-11-26", { lifts: { curls: { weight: 30, reps: [10] } } });
    assert.ok("error" in saved);
  });
});

test("a weight that is negative, over 2000 or not in quarter pounds is refused", async () => {
  await withLifts(async ({ lifts }) => {
    for (const weight of [-5, 2005, 135.1, "135", null]) {
      const saved = await lifts.save("2026-11-26", {
        lifts: { "bench-press": { weight, reps: [7] } },
      });
      assert.ok("error" in saved, String(weight));
    }
  });
});

test("reps that aren't whole numbers from 0 to 99, or more than three sets, are refused", async () => {
  await withLifts(async ({ lifts }) => {
    for (const reps of [[7.5], [100], [-1], ["7"], [7, 7, 7, 7], 7]) {
      const saved = await lifts.save("2026-11-26", {
        lifts: { "bench-press": { weight: 135, reps } },
      });
      assert.ok("error" in saved, JSON.stringify(reps));
    }
  });
});

test("lifts are still there after reopening", async () => {
  await withTempDir(async (dir) => {
    const checkIn = async () => {};
    const first = await openLifts({ dir, checkIn });
    await first.save("2026-11-26", { lifts: { "hip-thrusts": { weight: 185, reps: [7, 7, 7] } } });
    const reopened = await openLifts({ dir, checkIn });
    assert.deepEqual(reopened.range("2026-11-26", "2026-11-26"), {
      lifts: { "2026-11-26": { "hip-thrusts": { weight: 185, reps: [7, 7, 7] } } },
    });
  });
});
