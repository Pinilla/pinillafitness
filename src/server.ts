import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkInsBetween, isDate, readActivities, readTimes, withDay, type CheckIns, type Times } from "./checkins.ts";
import { openJsonFile } from "./json-file.ts";
import { createLogin } from "./login.ts";
import { loadPusher, type PushSubscription } from "./push.ts";
import { reminderDue } from "./reminder.ts";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3400);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.FITNESS_DATA ?? join(ROOT, "data");
const PIN = process.env.FITNESS_PIN ?? "";
const PUSH_CONTACT = process.env.PUSH_CONTACT ?? "https://fitness.pinillaweb.org";
const PUBLIC = join(ROOT, "public");
const MINUTE_MS = 60_000;

const FILE_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'";

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
type Route = { method: string; path: RegExp; handle(req: IncomingMessage, url: URL, match: RegExpExecArray): Promise<Reply> };

if (!/^\d{4,8}$/.test(PIN)) {
  console.error("Set FITNESS_PIN to 4 to 8 digits.");
  process.exit(1);
}

await mkdir(DATA, { recursive: true });
const checkIns = await openJsonFile<CheckIns>(join(DATA, "checkins.json"), {});
const times = await openJsonFile<Times>(join(DATA, "times.json"), {});
const subscriptions = await openJsonFile<PushSubscription[]>(join(DATA, "subscriptions.json"), []);
const reminded = await openJsonFile<{ date: string | null }>(join(DATA, "reminded.json"), { date: null });
const pusher = await loadPusher(join(DATA, "push-key.json"), PUSH_CONTACT);
const login = createLogin(PIN, await loadSecret(join(DATA, "secret")));

const routes: Route[] = [
  { method: "GET", path: /^\/api\/checkins$/, handle: listCheckIns },
  { method: "PUT", path: /^\/api\/checkins\/(\d{4}-\d{2}-\d{2})$/, handle: saveCheckIn },
  { method: "GET", path: /^\/api\/times$/, handle: async () => ok(times.get()) },
  { method: "PUT", path: /^\/api\/times$/, handle: saveTimes },
  { method: "GET", path: /^\/api\/push\/key$/, handle: async () => ok({ publicKey: pusher.publicKey }) },
  { method: "POST", path: /^\/api\/push\/subscribe$/, handle: subscribe },
  { method: "POST", path: /^\/api\/push\/unsubscribe$/, handle: unsubscribe },
  { method: "POST", path: /^\/api\/push\/test$/, handle: sendTest },
];

async function loadSecret(path: string) {
  try {
    return await readFile(path);
  } catch {
    const secret = randomBytes(32);
    await writeFile(path, secret, { mode: 0o600 });
    return secret;
  }
}

async function listCheckIns(_req: IncomingMessage, url: URL): Promise<Reply> {
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isDate(from) || !isDate(to)) return problem(400, "from and to must be YYYY-MM-DD dates.");
  return ok({ checkIns: checkInsBetween(checkIns.get(), from, to), first: firstCheckIn() });
}

async function saveCheckIn(req: IncomingMessage, _url: URL, match: RegExpExecArray): Promise<Reply> {
  const date = match[1]!;
  if (!isDate(date)) return problem(400, "That isn't a real date.");
  const read = readActivities(await readJson(req));
  if ("error" in read) return problem(400, read.error);
  const before = checkIns.get()[date] ?? [];
  await checkIns.set(withDay(checkIns.get(), date, read.activities));
  await logChange(date, before, read.activities);
  return ok({ activities: read.activities });
}

async function saveTimes(req: IncomingMessage): Promise<Reply> {
  const read = readTimes(await readJson(req));
  if ("error" in read) return problem(400, read.error);
  await times.set({ ...times.get(), ...read.times });
  return ok(times.get());
}

async function subscribe(req: IncomingMessage): Promise<Reply> {
  const endpoint = readEndpoint(await readJson(req));
  if (!endpoint) return problem(400, "endpoint must be an https URL.");
  await subscriptions.set([...withoutEndpoint(endpoint), { endpoint }]);
  return ok({ subscribed: true });
}

async function unsubscribe(req: IncomingMessage): Promise<Reply> {
  const endpoint = readEndpoint(await readJson(req));
  if (!endpoint) return problem(400, "endpoint must be an https URL.");
  await subscriptions.set(withoutEndpoint(endpoint));
  return ok({ subscribed: false });
}

async function sendTest(): Promise<Reply> {
  const sent = await pushToAll();
  if (!sent) return problem(409, "No phone has reminders turned on.");
  return ok({ sent });
}

function readEndpoint(body: unknown) {
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2000 || !endpoint.startsWith("https://")) return null;
  return URL.canParse(endpoint) ? endpoint : null;
}

function withoutEndpoint(endpoint: string) {
  return subscriptions.get().filter((s) => s.endpoint !== endpoint);
}

function firstCheckIn() {
  return Object.keys(checkIns.get()).sort()[0] ?? null;
}

async function logChange(date: string, before: string[], after: string[]) {
  const line = JSON.stringify({ at: new Date().toISOString(), date, before, after });
  await appendFile(join(DATA, "changes.jsonl"), line + "\n");
}

async function pushToAll() {
  let sent = 0;
  for (const subscription of subscriptions.get()) {
    const result = await pusher.push(subscription);
    if (result === "sent") sent++;
    if (result === "gone") await subscriptions.set(withoutEndpoint(subscription.endpoint));
    if (result === "failed") console.error(`Push to ${new URL(subscription.endpoint).host} failed.`);
  }
  return sent;
}

async function remindIfDue() {
  const date = reminderDue(new Date(), checkIns.get(), reminded.get().date);
  if (!date) return;
  await reminded.set({ date });
  console.log(`No check-in for ${date}. Reminded ${await pushToAll()} phone(s).`);
}

function ok(body: unknown): Reply {
  return { status: 200, body };
}

function problem(status: number, error: string): Reply {
  return { status, body: { error } };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) throw new Error("expected JSON");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) throw new Error("too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function api(req: IncomingMessage, url: URL): Promise<Reply> {
  if (url.pathname === "/api/login" && req.method === "POST") return attemptLogin(req);
  if (!login.isLoggedIn(req)) return problem(401, "Log in first.");
  for (const route of routes) {
    const match = route.path.exec(url.pathname);
    if (match && route.method === req.method) return route.handle(req, url, match);
  }
  return problem(404, "not found");
}

async function attemptLogin(req: IncomingMessage): Promise<Reply> {
  const body = (await readJson(req)) as { pin?: unknown } | null;
  const result = login.attempt(req, body?.pin);
  if ("error" in result) return problem(result.status, result.error);
  return { status: 200, body: { ok: true }, headers: { "set-cookie": result.cookie } };
}

function sendReply(res: ServerResponse, reply: Reply) {
  res.writeHead(reply.status, { "content-type": "application/json", "cache-control": "no-store", ...reply.headers });
  res.end(JSON.stringify(reply.body));
}

async function serveFile(res: ServerResponse, pathname: string) {
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!/^[a-z0-9-]+\.[a-z]+$/.test(name)) return sendReply(res, problem(404, "not found"));
  try {
    const body = await readFile(join(PUBLIC, name));
    res.writeHead(200, fileHeaders(name));
    res.end(body);
  } catch {
    sendReply(res, problem(404, "not found"));
  }
}

function fileHeaders(name: string) {
  return {
    "content-type": FILE_TYPES[extname(name)] ?? "application/octet-stream",
    "cache-control": "no-cache",
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/healthz") return sendReply(res, ok({ ok: true }));
  if (url.pathname.startsWith("/api/")) return sendReply(res, await api(req, url));
  if (req.method !== "GET" && req.method !== "HEAD") return sendReply(res, problem(405, "method not allowed"));
  return serveFile(res, url.pathname);
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendReply(res, problem(400, "bad request"));
  });
});

function runReminders() {
  remindIfDue().catch((err) => console.error(err));
}

server.listen(PORT, HOST, () => console.log(`pinillafitness on http://${HOST}:${PORT}`));
runReminders();
setInterval(runReminders, MINUTE_MS);
