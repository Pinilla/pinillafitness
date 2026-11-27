import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openUsers } from "../src/users.ts";

const PORT = 39_000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let dataDir = "";
let server: ChildProcess;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "fitness-server-"));
  const users = await openUsers(join(dataDir, "users.json"));
  await users.add("pinilla", "pinilla-password");
  await users.add("jack", "jack-password");
  server = spawn(process.execPath, ["src/server.ts"], {
    env: { ...process.env, PORT: String(PORT), FITNESS_DATA: dataDir },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await once(server.stdout!, "data");
});

after(async () => {
  server.kill();
  await once(server, "exit");
  await rm(dataDir, { recursive: true });
});

async function logIn(username: string, password: string) {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return {
    status: response.status,
    cookie: (response.headers.get("set-cookie") ?? "").split(";")[0]!,
  };
}

async function call(cookie: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("each person sees only their own check-ins and times", async () => {
  const pinilla = (await logIn("pinilla", "pinilla-password")).cookie;
  const jack = (await logIn("jack", "jack-password")).cookie;
  await call(pinilla, "PUT", "/api/checkins/2026-11-24", { activities: ["lift"] });
  await call(jack, "PUT", "/api/times", { times: { butterfly: 120 } });

  const jackDays = await call(jack, "GET", "/api/checkins?from=2026-11-01&to=2026-11-30");
  const pinillaTimes = await call(pinilla, "GET", "/api/times");
  assert.deepEqual(jackDays.body, { checkIns: {}, first: null });
  assert.deepEqual(pinillaTimes.body, {});
});

test("a wrong password is refused", async () => {
  assert.equal((await logIn("jack", "pinilla-password")).status, 401);
});

test("the API needs a login, and a forged cookie doesn't count", async () => {
  assert.equal((await call("", "GET", "/api/me")).status, 401);
  assert.equal((await call("fitness=jack.forged", "GET", "/api/me")).status, 401);
});

test("logging in tells the page who is logged in", async () => {
  const jack = (await logIn("jack", "jack-password")).cookie;
  assert.deepEqual((await call(jack, "GET", "/api/me")).body, { username: "jack" });
});

test("logging a lift checks in the day as a lift", async () => {
  const pinilla = (await logIn("pinilla", "pinilla-password")).cookie;
  await call(pinilla, "PUT", "/api/lifts/2026-11-20", {
    lifts: { "overhead-press": { weight: 95, reps: [7, 7, 7] } },
  });
  const days = await call(pinilla, "GET", "/api/checkins?from=2026-11-20&to=2026-11-20");
  assert.deepEqual(days.body.checkIns, { "2026-11-20": ["lift"] });
});
