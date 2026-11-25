import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openReminders } from "../src/reminders.ts";
import { withTempDir } from "./helpers.ts";

type Reminders = Awaited<ReturnType<typeof openReminders>>;
type IsCheckedIn = (username: string, date: string) => boolean;

const beforeTen = new Date(2026, 10, 24, 21, 59);
const afterTen = new Date(2026, 10, 24, 22, 1);
const honoluluBeforeTen = new Date(Date.UTC(2026, 10, 25, 7, 59));
const honoluluAfterTen = new Date(Date.UTC(2026, 10, 25, 8, 1));
const honoluluPhone = "https://push.example.com/honolulu-phone";

async function withEmptyReminders(
  isCheckedIn: IsCheckedIn,
  run: (reminders: Reminders, pushed: string[]) => Promise<void>,
) {
  await withTempDir(async (dir) => {
    const pushed: string[] = [];
    const post = async (url: string | URL | Request) => {
      pushed.push(String(url));
      return new Response(null, { status: 201 });
    };
    const reminders = await openReminders({
      dir,
      contact: "https://fitness.example",
      isCheckedIn: async (username, date) => isCheckedIn(username, date),
      post: post as typeof fetch,
    });
    await run(reminders, pushed);
  });
}

async function withReminders(
  checkedIn: string[],
  run: (reminders: Reminders, pushed: string[]) => Promise<void>,
) {
  await withEmptyReminders(
    (username) => checkedIn.includes(username),
    async (reminders, pushed) => {
      await reminders.subscribe("pinilla", { endpoint: "https://push.example.com/pinilla-phone" });
      await reminders.subscribe("jack", { endpoint: "https://push.example.com/jack-phone" });
      await run(reminders, pushed);
    },
  );
}

async function withHonoluluPhone(
  isCheckedIn: IsCheckedIn,
  run: (reminders: Reminders, pushed: string[]) => Promise<void>,
) {
  await withEmptyReminders(isCheckedIn, async (reminders, pushed) => {
    await reminders.subscribe("jack", { endpoint: honoluluPhone, timeZone: "Pacific/Honolulu" });
    await run(reminders, pushed);
  });
}

test("no reminder goes out before 10 PM", async () => {
  await withReminders([], async (reminders, pushed) => {
    await reminders.check(beforeTen);
    assert.deepEqual(pushed, []);
  });
});

test("after 10 PM only the people who haven't checked in get a reminder", async () => {
  await withReminders(["jack"], async (reminders, pushed) => {
    await reminders.check(afterTen);
    assert.deepEqual(pushed, ["https://push.example.com/pinilla-phone"]);
  });
});

test("each person gets one reminder a day", async () => {
  await withReminders([], async (reminders, pushed) => {
    await reminders.check(afterTen);
    await reminders.check(new Date(2026, 10, 24, 23, 0));
    assert.equal(pushed.length, 2);
  });
});

test("a test reminder goes only to the asking person's phones", async () => {
  await withReminders([], async (reminders, pushed) => {
    assert.deepEqual(await reminders.sendTest("jack"), { sent: 1 });
    assert.deepEqual(pushed, ["https://push.example.com/jack-phone"]);
  });
});

test("a phone that logs in as someone else moves to their reminders", async () => {
  await withReminders(["jack"], async (reminders, pushed) => {
    await reminders.subscribe("jack", { endpoint: "https://push.example.com/pinilla-phone" });
    await reminders.check(afterTen);
    assert.deepEqual(pushed, []);
  });
});

test("a phone saved before accounts existed gets nothing until it logs in", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      join(dir, "subscriptions.json"),
      JSON.stringify([{ endpoint: "https://push.example.com/old" }]),
    );
    const pushed: string[] = [];
    const reminders = await openReminders({
      dir,
      contact: "https://fitness.example",
      isCheckedIn: async () => false,
      post: (async (url: string) => {
        pushed.push(url);
        return new Response(null, { status: 201 });
      }) as typeof fetch,
    });
    await reminders.check(afterTen);
    assert.deepEqual(pushed, []);
  });
});

test("an endpoint that isn't https is refused", async () => {
  await withReminders([], async (reminders) => {
    assert.ok(
      "error" in (await reminders.subscribe("jack", { endpoint: "http://push.example.com/x" })),
    );
  });
});

test("a phone is reminded at 10 PM in its own time zone", async () => {
  await withHonoluluPhone(
    () => false,
    async (reminders, pushed) => {
      await reminders.check(honoluluBeforeTen);
      assert.deepEqual(pushed, []);
      await reminders.check(honoluluAfterTen);
      assert.deepEqual(pushed, [honoluluPhone]);
    },
  );
});

test("a check-in counts on the phone's own date", async () => {
  await withHonoluluPhone(
    (_username, date) => date === "2026-11-24",
    async (reminders, pushed) => {
      await reminders.check(honoluluAfterTen);
      assert.deepEqual(pushed, []);
    },
  );
});

test("a phone with an unknown time zone follows the server's clock", async () => {
  await withEmptyReminders(
    () => false,
    async (reminders, pushed) => {
      await reminders.subscribe("jack", { endpoint: honoluluPhone, timeZone: "Nowhere/Special" });
      await reminders.check(afterTen);
      assert.deepEqual(pushed, [honoluluPhone]);
    },
  );
});
