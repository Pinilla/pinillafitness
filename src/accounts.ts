import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openCheckIns, type CheckInBook } from "./checkins.ts";
import { openTimes, type TimeBook } from "./times.ts";

export type Account = { checkIns: CheckInBook; times: TimeBook };
export type Accounts = { get(username: string): Promise<Account> };

export function openAccounts(dir: string): Accounts {
  const opened = new Map<string, Promise<Account>>();

  return {
    get(username) {
      if (!opened.has(username)) {
        opened.set(username, openAccount(join(dir, username)));
      }
      return opened.get(username)!;
    },
  };
}

async function openAccount(dir: string): Promise<Account> {
  await mkdir(dir, { recursive: true });
  return { checkIns: await openCheckIns(dir), times: await openTimes(dir) };
}
