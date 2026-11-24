import type { IncomingMessage } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "fitness";
const YEAR_SECONDS = 365 * 24 * 3600;
const FAILS_PER_ADDRESS = 5;
const ADDRESS_WINDOW_MS = 15 * 60_000;
const FAILS_IN_TOTAL = 30;
const TOTAL_WINDOW_MS = 60 * 60_000;

export type LoginResult = { cookie: string } | { status: number; error: string };

export function createLogin(pin: string, secret: Buffer) {
  const token = createHmac("sha256", secret).update(pin).digest("base64url");
  const fails = createFailCounter();

  return {
    isLoggedIn(req: IncomingMessage) {
      return sameText(readCookie(req, COOKIE), token);
    },
    attempt(req: IncomingMessage, guess: unknown): LoginResult {
      const address = clientAddress(req);
      if (fails.tooMany(address)) return { status: 429, error: "Too many wrong PINs. Try again in 15 minutes." };
      if (typeof guess !== "string" || !sameText(guess, pin)) {
        fails.record(address);
        return { status: 401, error: "That PIN isn't right." };
      }
      return { cookie: loginCookie(req, token) };
    },
  };
}

function createFailCounter() {
  const byAddress = new Map<string, number[]>();
  let all: number[] = [];

  function recent(times: number[], windowMs: number) {
    const now = Date.now();
    return times.filter((t) => now - t < windowMs);
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

function loginCookie(req: IncomingMessage, token: string) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; Max-Age=${YEAR_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}

function readCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

function clientAddress(req: IncomingMessage) {
  return (req.headers["x-real-ip"] as string | undefined) ?? req.socket.remoteAddress ?? "";
}

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
