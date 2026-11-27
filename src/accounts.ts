import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openCheckIns, type CheckInBook } from "./checkins.ts";
import { openLifts, type LiftBook } from "./lifts.ts";
import { openTimes, type TimeBook } from "./times.ts";

export type Account = { checkIns: CheckInBook; times: TimeBook; lifts: LiftBook };
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
  const checkIns = await openCheckIns(dir);
  const lifts = await openLifts({ dir, checkIn: (date) => checkIns.add(date, "lift") });
  return { checkIns, times: await openTimes(dir), lifts };
}
