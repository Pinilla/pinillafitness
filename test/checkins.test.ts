import { test } from "node:test";
import assert from "node:assert/strict";
import { isDate, readActivities, readTimes, withDay } from "../src/checkins.ts";

test("activities are saved in a fixed order without repeats", () => {
  assert.deepEqual(readActivities({ activities: ["upper", "lift", "upper"] }), { activities: ["lift", "upper"] });
});

test("an activity other than lift, lower or upper is refused", () => {
  assert.ok("error" in readActivities({ activities: ["run"] }));
  assert.ok("error" in readActivities({ activities: "lift" }));
});

test("times are refused for an unknown stretch or outside 5 to 600 whole seconds", () => {
  assert.ok("error" in readTimes({ times: { jogging: 60 } }));
  assert.ok("error" in readTimes({ times: { butterfly: 4 } }));
  assert.ok("error" in readTimes({ times: { butterfly: 30.5 } }));
  assert.deepEqual(readTimes({ times: { butterfly: 90 } }), { times: { butterfly: 90 } });
});

test("clearing every activity removes the day", () => {
  assert.deepEqual(withDay({ "2026-11-24": ["lift"], "2026-11-23": ["lower"] }, "2026-11-24", []), { "2026-11-23": ["lower"] });
});

test("only real calendar dates count as dates", () => {
  assert.ok(isDate("2026-11-24"));
  assert.ok(!isDate("2026-13-01"));
  assert.ok(!isDate("2026-11-24T00:00"));
});
