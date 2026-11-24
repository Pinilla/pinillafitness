import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderDue } from "../src/reminder.ts";

const tenPast10 = new Date(2026, 10, 24, 22, 10);

test("no reminder before 10 PM", () => {
  assert.equal(reminderDue(new Date(2026, 10, 24, 21, 59), {}, null), null);
});

test("at 10 PM with no check-in today, the reminder is due for today", () => {
  assert.equal(reminderDue(tenPast10, { "2026-11-23": ["lift"] }, "2026-11-23"), "2026-11-24");
});

test("no reminder once today is checked in", () => {
  assert.equal(reminderDue(tenPast10, { "2026-11-24": ["lower"] }, null), null);
});

test("only one reminder a day", () => {
  assert.equal(reminderDue(tenPast10, {}, "2026-11-24"), null);
});
