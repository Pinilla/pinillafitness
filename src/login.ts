import type { IncomingMessage } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Users } from "./users.ts";

export type LoginResult = { username: string; cookie: string } | { status: number; error: string };

const COOKIE = "fitness";
const YEAR_SECONDS = 365 * 24 * 3600;
const FAILS_PER_ADDRESS = 5;
const ADDRESS_WINDOW_MS = 15 * 60_000;
const FAILS_IN_TOTAL = 30;
const TOTAL_WINDOW_MS = 60 * 60_000;

export function createLogin(users: Users, secret: Buffer) {
  const fails = createFailCounter();

  function signature(username: string) {
    return createHmac("sha256", secret).update(`session:${username}`).digest("base64url");
  }

  return {
    userOf(req: IncomingMessage): string | null {
      const [username, signed] = splitSession(readCookie(req));
      if (!username || !users.exists(username) || !sameText(signed, signature(username))) {
        return null;
      }
      return username;
    },
    async attempt(req: IncomingMessage, body: unknown): Promise<LoginResult> {
      const address = clientAddress(req);
      if (fails.tooMany(address)) {
        return { status: 429, error: "Too many wrong passwords. Try again in 15 minutes." };
      }
      const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };
      const verified = await users.verify(username, password);
      if (!verified) {
        fails.record(address);
        return { status: 401, error: "That username or password isn't right." };
      }
      return {
        username: verified,
        cookie: sessionCookie(req, `${verified}.${signature(verified)}`, YEAR_SECONDS),
      };
    },
    logoutCookie(req: IncomingMessage) {
      return sessionCookie(req, "", 0);
    },
  };
}

function createFailCounter() {
  const byAddress = new Map<string, number[]>();
  let all: number[] = [];

  function recent(times: number[], windowMs: number) {
    const now = Date.now();
    return times.filter((time) => now - time < windowMs);
  }

  return {
    tooMany(address: string) {
      const mine = recent(byAddress.get(address) ?? [], ADDRESS_WINDOW_MS);
      byAddress.set(address, mine);
      all = recent(all, TOTAL_WINDOW_MS);
      return mine.length >= FAILS_PER_ADDRESS || all.length >= FAILS_IN_TOTAL;
    },
    record(address: string) {
      const now = Date.now();
      byAddress.set(address, [...(byAddress.get(address) ?? []), now]);
      all.push(now);
    },
  };
}

function splitSession(value: string): [string, string] {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) {
    return ["", ""];
  }
  return [value.slice(0, dot), value.slice(dot + 1)];
}

function sessionCookie(req: IncomingMessage, value: string, maxAgeSeconds: number) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

function readCookie(req: IncomingMessage) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const equals = part.indexOf("=");
    if (equals > 0 && part.slice(0, equals).trim() === COOKIE) {
      return part.slice(equals + 1).trim();
    }
  }
  return "";
}

function clientAddress(req: IncomingMessage) {
  return (req.headers["x-real-ip"] as string | undefined) ?? req.socket.remoteAddress ?? "";
}

function sameText(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
