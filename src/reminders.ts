import { join } from "node:path";
import { isoDate } from "../public/dates.js";
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
type Subscription = { username: string; endpoint: string };

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
        { username, endpoint },
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
      if (now.getHours() < REMINDER_HOUR) {
        return;
      }
      for (const username of subscribedUsers(subscriptions.get())) {
        await remindIfDue(username, isoDate(now));
      }
    },
  };

  async function remindIfDue(username: string, date: string) {
    if (reminded.get()[username] === date || (await options.isCheckedIn(username, date))) {
      return;
    }
    await reminded.set({ ...reminded.get(), [username]: date });
    console.log(
      `${username} has no check-in for ${date}. Reminded ${await sender.pushTo(username)} phone(s).`,
    );
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

function subscribedUsers(subscriptions: Subscription[]) {
  const usernames = subscriptions.map((subscription) => subscription.username).filter(Boolean);
  return [...new Set(usernames)];
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
