import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

export type Reply = { status: number; body: unknown; headers?: Record<string, string> };

const MAX_BODY_BYTES = 10_000;
const FILE_NAME_PATTERN = /^[a-z0-9-]+\.[a-z]+$/;
const FILE_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'";

export function ok(body: unknown, headers?: Record<string, string>): Reply {
  return { status: 200, body, headers };
}

export function problem(status: number, error: string): Reply {
  return { status, body: { error } };
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
    throw new Error("expected JSON");
  }
  return JSON.parse(await readBody(req));
}

export function sendReply(res: ServerResponse, reply: Reply) {
  res.writeHead(reply.status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...reply.headers,
  });
  res.end(JSON.stringify(reply.body));
}

export async function serveFile(res: ServerResponse, publicDir: string, pathname: string) {
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  const body = FILE_NAME_PATTERN.test(name)
    ? await readFile(join(publicDir, name)).catch(() => null)
    : null;
  if (!body) {
    sendReply(res, problem(404, "not found"));
    return;
  }
  res.writeHead(200, fileHeaders(name));
  res.end(body);
}

async function readBody(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fileHeaders(name: string) {
  return {
    "content-type": FILE_TYPES[extname(name)] ?? "application/octet-stream",
    "cache-control": "no-cache",
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}
