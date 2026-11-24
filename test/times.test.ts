import { test } from "node:test";
import assert from "node:assert/strict";
import { openTimes } from "../src/times.ts";
import { withTempDir } from "./helpers.ts";

test("saving a time keeps the times saved before", async () => {
  await withTempDir(async (dir) => {
    const times = await openTimes(dir);
    await times.save({ times: { butterfly: 90 } });
    await times.save({ times: { pigeon: 45 } });
    assert.deepEqual(times.get(), { butterfly: 90, pigeon: 45 });
  });
});

test("a time for an unknown stretch is refused", async () => {
  await withTempDir(async (dir) => {
    assert.ok("error" in (await (await openTimes(dir)).save({ times: { jogging: 60 } })));
  });
});

test("a time outside the hold limits is refused", async () => {
  await withTempDir(async (dir) => {
    const times = await openTimes(dir);
    for (const seconds of [0, 601, 62, 30.5]) {
      assert.ok("error" in (await times.save({ times: { butterfly: seconds } })), String(seconds));
    }
  });
});
