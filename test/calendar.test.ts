import { test } from "node:test";
import assert from "node:assert/strict";
import { countCheckIns, dayStatus, monthGrid } from "../public/calendar.js";

test("a month's grid runs Monday to Sunday and covers every day of the month", () => {
  const weeks = monthGrid(2026, 10);
  assert.equal(weeks[0][0].date, "2026-10-26");
  assert.equal(weeks.at(-1).at(-1).date, "2026-12-06");
  assert.equal(weeks.flat().filter((cell) => cell.inMonth).length, 30);
});

test("December's grid ends in the first week of January", () => {
  const weeks = monthGrid(2026, 11);
  assert.equal(weeks.at(-1).at(-1).date, "2027-01-03");
  assert.equal(weeks.length, 5);
});

test("a day shows lift, stretch or both from its check-ins", () => {
  const checkIns = {
    "2026-11-02": ["lift"],
    "2026-11-03": ["upper"],
    "2026-11-04": ["lift", "lower"],
  };
  const statuses = ["2026-11-02", "2026-11-03", "2026-11-04"].map((d) =>
    dayStatus(d, "2026-11-24", checkIns, "2026-11-02"),
  );
  assert.deepEqual(statuses, ["lift", "stretch", "both"]);
});

test("a past day without a check-in is missed only after the first check-in ever", () => {
  const checkIns = { "2026-11-10": ["lift"] };
  assert.equal(dayStatus("2026-11-09", "2026-11-24", checkIns, "2026-11-10"), "open");
  assert.equal(dayStatus("2026-11-11", "2026-11-24", checkIns, "2026-11-10"), "missed");
  assert.equal(dayStatus("2026-11-24", "2026-11-24", checkIns, "2026-11-10"), "open");
});

test("the month count includes only days in that month", () => {
  const checkIns = {
    "2026-10-31": ["lift"],
    "2026-11-01": ["lift"],
    "2026-11-02": ["lower", "lift"],
  };
  assert.equal(countCheckIns(checkIns, 2026, 10), 2);
});
