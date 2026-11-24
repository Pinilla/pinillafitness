import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicKey, verify } from "node:crypto";
import { loadPusher } from "../src/push.ts";

async function withKeyFile(run: (keyFile: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "fitness-push-"));
  try {
    await run(join(dir, "push-key.json"));
  } finally {
    await rm(dir, { recursive: true });
  }
}

function publicKeyFromRaw(raw: string) {
  const point = Buffer.from(raw, "base64url");
  const jwk = { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") };
  return createPublicKey({ key: jwk, format: "jwk" });
}

test("a push is an empty POST signed with a VAPID token for the push service", async () => {
  await withKeyFile(async (keyFile) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const post = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(null, { status: 201 });
    };
    const pusher = await loadPusher(keyFile, "https://fitness.example", post as typeof fetch);
    assert.equal(await pusher.push({ endpoint: "https://push.example.com/send/abc" }), "sent");

    const headers = calls[0]!.init.headers as Record<string, string>;
    const [, token, key] = /^vapid t=(.+), k=(.+)$/.exec(headers.authorization!)!;
    assert.equal(key, pusher.publicKey);
    const [header, claims, signature] = token!.split(".");
    const ok = verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKeyFromRaw(key!), dsaEncoding: "ieee-p1363" }, Buffer.from(signature!, "base64url"));
    assert.ok(ok);
    const decoded = JSON.parse(Buffer.from(claims!, "base64url").toString());
    assert.deepEqual([decoded.aud, decoded.sub], ["https://push.example.com", "https://fitness.example"]);
    assert.equal(calls[0]!.init.body, undefined);
  });
});

test("a subscription the push service no longer knows is reported gone", async () => {
  await withKeyFile(async (keyFile) => {
    const pusher = await loadPusher(keyFile, "https://fitness.example", (async () => new Response(null, { status: 410 })) as typeof fetch);
    assert.equal(await pusher.push({ endpoint: "https://push.example.com/x" }), "gone");
  });
});

test("a network error is reported as failed", async () => {
  await withKeyFile(async (keyFile) => {
    const pusher = await loadPusher(keyFile, "https://fitness.example", (async () => { throw new Error("offline"); }) as typeof fetch);
    assert.equal(await pusher.push({ endpoint: "https://push.example.com/x" }), "failed");
  });
});

test("the key is created once and reused after a restart", async () => {
  await withKeyFile(async (keyFile) => {
    const first = await loadPusher(keyFile, "https://fitness.example");
    const second = await loadPusher(keyFile, "https://fitness.example");
    assert.equal(first.publicKey, second.publicKey);
    assert.equal(Buffer.from(first.publicKey, "base64url").length, 65);
  });
});
