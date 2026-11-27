import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openCheckIns } from "../src/checkins.ts";
import { withTempDir } from "./helpers.ts";

test("activities are saved in a fixed order without repeats", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    assert.deepEqual(await book.save("2026-11-24", { activities: ["upper", "lift", "upper"] }), {
      activities: ["lift", "upper"],
    });
  });
});

test("an activity other than lift, lower or upper is refused", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    assert.ok("error" in (await book.save("2026-11-24", { activities: ["run"] })));
  });
});

test("a date that isn't on the calendar is refused", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    assert.ok("error" in (await book.save("2026-02-30", { activities: ["lift"] })));
  });
});

test("clearing every activity removes the day", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    await book.save("2026-11-24", { activities: ["lift"] });
    await book.save("2026-11-24", { activities: [] });
    assert.equal(book.isCheckedIn("2026-11-24"), false);
  });
});

test("a range returns its days and the first check-in ever", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    await book.save("2026-10-02", { activities: ["lift"] });
    await book.save("2026-11-24", { activities: ["lower"] });
    assert.deepEqual(book.range("2026-11-01", "2026-11-30"), {
      checkIns: { "2026-11-24": ["lower"] },
      first: "2026-10-02",
    });
  });
});

test("check-ins are still there after reopening", async () => {
  await withTempDir(async (dir) => {
    await (await openCheckIns(dir)).save("2026-11-24", { activities: ["lift"] });
    assert.ok((await openCheckIns(dir)).isCheckedIn("2026-11-24"));
  });
});

test("every change is logged with the day before and after", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    await book.save("2026-11-24", { activities: ["lift"] });
    await book.save("2026-11-24", { activities: ["lift", "upper"] });
    const lines = (await readFile(join(dir, "changes.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(lines.at(-1), {
      at: lines.at(-1).at,
      date: "2026-11-24",
      before: ["lift"],
      after: ["lift", "upper"],
    });
  });
});

test("adding an activity keeps the day's other activities", async () => {
  await withTempDir(async (dir) => {
    const book = await openCheckIns(dir);
    await book.save("2026-11-24", { activities: ["upper"] });
    await book.add("2026-11-24", "lift");
    assert.deepEqual(book.range("2026-11-24", "2026-11-24"), {
      checkIns: { "2026-11-24": ["lift", "upper"] },
      first: "2026-11-24",
    });
  });
});
