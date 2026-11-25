import { join } from "node:path";
import { openJsonFile, type JsonFile } from "./json-file.ts";
import { loadPusher, type Pusher } from "./push.ts";

export type Reminders = {
  info(): { publicKey: string; hour: number };
  subscribe(username: string, body: unknown): Promise<{ subscribed: boolean } | { error: string }>;
  unsubscribe(
    username: string,
    body: unknown,
  ): Promise<{ subscribed: boolean } | { error: string }>;
  sendTest(username: string): Promise<{ sent: number } | { error: string }>;
  check(now: Date): Promise<void>;
};

type ReminderOptions = {
  dir: string;
  contact: string;
  isCheckedIn(username: string, date: string): Promise<boolean>;
  post?: typeof fetch;
};
type Subscription = { username: string; endpoint: string; timeZone?: string };
type LocalClock = { date: string; hour: number };

const REMINDER_HOUR = 22;
const MAX_ENDPOINT_LENGTH = 2000;

export async function openReminders(options: ReminderOptions): Promise<Reminders> {
  const pusher = await loadPusher(
    join(options.dir, "push-key.json"),
    options.contact,
    options.post,
  );
  const subscriptions = await openJsonFile<Subscription[]>(
    join(options.dir, "subscriptions.json"),
    [],
  );
  const reminded = await openJsonFile<Record<string, string>>(
    join(options.dir, "reminded.json"),
    {},
  );
  const sender = createSender(pusher, subscriptions);

  return {
    info() {
      return { publicKey: pusher.publicKey, hour: REMINDER_HOUR };
    },
    async subscribe(username, body) {
      const endpoint = readEndpoint(body);
      if (!endpoint) {
        return { error: "endpoint must be an https URL." };
      }
      await subscriptions.set([
        ...withoutEndpoint(subscriptions.get(), endpoint),
        { username, endpoint, timeZone: readTimeZone(body) },
      ]);
      return { subscribed: true };
    },
    async unsubscribe(_username, body) {
      const endpoint = readEndpoint(body);
      if (!endpoint) {
        return { error: "endpoint must be an https URL." };
      }
      await subscriptions.set(withoutEndpoint(subscriptions.get(), endpoint));
      return { subscribed: false };
    },
    async sendTest(username) {
      const sent = await sender.pushTo(username);
      if (!sent) {
        return { error: "No phone has reminders turned on for this account." };
      }
      return { sent };
    },
    async check(now) {
      for (const subscription of subscriptions.get().filter((s) => s.username)) {
        await remindIfDue(subscription, localClock(now, subscription.timeZone));
      }
    },
  };

  async function remindIfDue(subscription: Subscription, clock: LocalClock) {
    if (clock.hour < REMINDER_HOUR || reminded.get()[subscription.endpoint] === clock.date) {
      return;
    }
    if (await options.isCheckedIn(subscription.username, clock.date)) {
      return;
    }
    await markReminded(subscription.endpoint, clock.date);
    if (await sender.pushOne(subscription)) {
      console.log(`${subscription.username} has no check-in for ${clock.date}. Reminded a phone.`);
    }
  }

  async function markReminded(endpoint: string, date: string) {
    const current = new Set(subscriptions.get().map((subscription) => subscription.endpoint));
    const kept = Object.entries(reminded.get()).filter(([key]) => current.has(key));
    await reminded.set({ ...Object.fromEntries(kept), [endpoint]: date });
  }
}

function createSender(pusher: Pusher, subscriptions: JsonFile<Subscription[]>) {
  async function pushOne(subscription: Subscription) {
    const result = await pusher.push(subscription);
    if (result === "gone") {
      await subscriptions.set(withoutEndpoint(subscriptions.get(), subscription.endpoint));
    }
    if (result === "failed") {
      console.error(`Push to ${new URL(subscription.endpoint).host} failed.`);
    }
    return result === "sent";
  }

  return {
    pushOne,
    async pushTo(username: string) {
      let sent = 0;
      for (const subscription of subscriptions.get().filter((s) => s.username === username)) {
        if (await pushOne(subscription)) {
          sent++;
        }
      }
      return sent;
    },
  };
}

function withoutEndpoint(subscriptions: Subscription[], endpoint: string) {
  return subscriptions.filter((subscription) => subscription.endpoint !== endpoint);
}

function readEndpoint(body: unknown) {
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (
    typeof endpoint !== "string" ||
    endpoint.length > MAX_ENDPOINT_LENGTH ||
    !endpoint.startsWith("https://")
  ) {
    return null;
  }
  return URL.canParse(endpoint) ? endpoint : null;
}

function readTimeZone(body: unknown) {
  const timeZone = (body as { timeZone?: unknown } | null)?.timeZone;
  if (typeof timeZone !== "string" || !isKnownTimeZone(timeZone)) {
    return undefined;
  }
  return timeZone;
}

function isKnownTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function localClock(now: Date, timeZone: string | undefined): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}
