import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { openJsonFile } from "./json-file.ts";

export type Users = {
  exists(username: string): boolean;
  verify(username: unknown, password: unknown): Promise<string | null>;
  add(username: string, password: string): Promise<void>;
};

type StoredPassword = { salt: string; hash: string };

const USERNAME_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const MIN_PASSWORD_LENGTH = 6;
const HASH_BYTES = 32;
const hashWith = promisify(scrypt) as (
  password: string,
  salt: string,
  bytes: number,
) => Promise<Buffer>;
const unknownUserPassword: StoredPassword = { salt: "no-such-user", hash: "" };

export async function openUsers(path: string): Promise<Users> {
  const file = await openJsonFile<Record<string, StoredPassword>>(path, {});

  return {
    exists(username) {
      return Object.hasOwn(file.get(), username);
    },
    async verify(username, password) {
      if (typeof username !== "string" || typeof password !== "string") {
        return null;
      }
      const stored = Object.hasOwn(file.get(), username)
        ? file.get()[username]!
        : unknownUserPassword;
      const matches = await passwordMatches(password, stored);
      return matches && stored !== unknownUserPassword ? username : null;
    },
    async add(username, password) {
      checkUsername(username);
      checkPassword(password);
      await file.set({ ...file.get(), [username]: await storedPassword(password) });
    },
  };
}

async function storedPassword(password: string): Promise<StoredPassword> {
  const salt = randomBytes(16).toString("base64url");
  const hash = await hashWith(password, salt, HASH_BYTES);
  return { salt, hash: hash.toString("base64url") };
}

async function passwordMatches(password: string, stored: StoredPassword) {
  const hash = await hashWith(password, stored.salt, HASH_BYTES);
  const expected = Buffer.from(stored.hash, "base64url");
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}

function checkUsername(username: string) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Usernames are 2 to 32 lowercase letters, digits or dashes, starting with a letter.",
    );
  }
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}
