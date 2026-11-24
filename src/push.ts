import { readFile, writeFile } from "node:fs/promises";
import { createPrivateKey, generateKeyPairSync, sign, type JsonWebKey, type KeyObject } from "node:crypto";

export type PushSubscription = { endpoint: string };
export type PushResult = "sent" | "gone" | "failed";
export type Pusher = {
  publicKey: string;
  push(subscription: PushSubscription): Promise<PushResult>;
};

const TOKEN_LIFETIME_SECONDS = 12 * 3600;
const MESSAGE_LIFETIME_SECONDS = 2 * 3600;

export async function loadPusher(keyFile: string, contact: string, post: typeof fetch = fetch): Promise<Pusher> {
  const jwk = await loadOrCreateKey(keyFile);
  const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
  const publicKey = rawPublicKey(jwk);
  return {
    publicKey,
    async push(subscription) {
      const headers = {
        authorization: `vapid t=${signedToken(privateKey, subscription.endpoint, contact)}, k=${publicKey}`,
        ttl: String(MESSAGE_LIFETIME_SECONDS),
        urgency: "high",
      };
      const response = await post(subscription.endpoint, { method: "POST", headers }).catch(() => null);
      return resultOf(response);
    },
  };
}

async function loadOrCreateKey(keyFile: string): Promise<JsonWebKey> {
  try {
    return JSON.parse(await readFile(keyFile, "utf8")) as JsonWebKey;
  } catch {
    const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
    await writeFile(keyFile, JSON.stringify(jwk), { mode: 0o600 });
    return jwk;
  }
}

function rawPublicKey(jwk: JsonWebKey) {
  const point = [Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")];
  return Buffer.concat(point).toString("base64url");
}

function signedToken(privateKey: KeyObject, endpoint: string, contact: string) {
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    sub: contact,
  };
  const unsigned = `${base64Json(header)}.${base64Json(claims)}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

function base64Json(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function resultOf(response: Response | null): PushResult {
  if (!response) return "failed";
  if (response.status === 404 || response.status === 410) return "gone";
  return response.ok ? "sent" : "failed";
}
