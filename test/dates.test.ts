import { test } from "node:test";
import assert from "node:assert/strict";
import { isDate, isoDate } from "../public/dates.js";

test("a local date is written as YYYY-MM-DD", () => {
  assert.equal(isoDate(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("only real calendar dates count as dates", () => {
  assert.ok(isDate("2028-02-29"));
  assert.ok(!isDate("2026-02-29"));
  assert.ok(!isDate("2026-13-01"));
  assert.ok(!isDate("2026-11-24T00:00"));
  assert.ok(!isDate(null));
});
