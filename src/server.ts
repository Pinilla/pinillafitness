import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openAccounts } from "./accounts.ts";
import { createApi } from "./api.ts";
import { ok, problem, sendReply, serveFile } from "./http.ts";
import { createLogin } from "./login.ts";
import { openReminders } from "./reminders.ts";
import { openUsers } from "./users.ts";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3400);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.FITNESS_DATA ?? join(ROOT, "data");
const PUSH_CONTACT = process.env.PUSH_CONTACT ?? "https://fitness.pinillaweb.org";
const PUBLIC = join(ROOT, "public");
const MINUTE_MS = 60_000;

await mkdir(DATA, { recursive: true });
const users = await openUsers(join(DATA, "users.json"));
const accounts = openAccounts(join(DATA, "accounts"));
const reminders = await openReminders({
  dir: DATA,
  contact: PUSH_CONTACT,
  isCheckedIn: async (username, date) => (await accounts.get(username)).checkIns.isCheckedIn(date),
});
const handleApi = createApi({
  login: createLogin(users, await loadSecret(join(DATA, "secret"))),
  accounts,
  reminders,
});

async function loadSecret(path: string) {
  try {
    return await readFile(path);
  } catch {
    const secret = randomBytes(32);
    await writeFile(path, secret, { mode: 0o600 });
    return secret;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/healthz") {
    sendReply(res, ok({ ok: true }));
  } else if (url.pathname.startsWith("/api/")) {
    sendReply(res, await handleApi(req, url));
  } else if (req.method === "GET" || req.method === "HEAD") {
    await serveFile(res, PUBLIC, url.pathname);
  } else {
    sendReply(res, problem(405, "method not allowed"));
  }
}

function handleSafely(req: IncomingMessage, res: ServerResponse) {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      sendReply(res, problem(400, "bad request"));
    }
  });
}

function checkReminders() {
  reminders.check(new Date()).catch((error) => console.error(error));
}

createServer(handleSafely).listen(PORT, HOST, () =>
  console.log(`pinillafitness on http://${HOST}:${PORT}`),
);
checkReminders();
setInterval(checkReminders, MINUTE_MS);
