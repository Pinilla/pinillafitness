import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openUsers } from "../src/users.ts";
import { withTempDir } from "./helpers.ts";

test("the right password verifies and the wrong one doesn't", async () => {
  await withTempDir(async (dir) => {
    const users = await openUsers(join(dir, "users.json"));
    await users.add("jack", "secret-word");
    assert.equal(await users.verify("jack", "secret-word"), "jack");
    assert.equal(await users.verify("jack", "secret-wore"), null);
  });
});

test("an unknown username doesn't verify", async () => {
  await withTempDir(async (dir) => {
    assert.equal(
      await (await openUsers(join(dir, "users.json"))).verify("nobody", "no-such-user"),
      null,
    );
  });
});

test("passwords are stored hashed, never as written", async () => {
  await withTempDir(async (dir) => {
    await (await openUsers(join(dir, "users.json"))).add("jack", "secret-word");
    assert.ok(!(await readFile(join(dir, "users.json"), "utf8")).includes("secret-word"));
  });
});

test("short passwords and badly formed usernames are refused", async () => {
  await withTempDir(async (dir) => {
    const users = await openUsers(join(dir, "users.json"));
    await assert.rejects(users.add("jack", "short"));
    await assert.rejects(users.add("Jack Smith", "long enough"));
  });
});
