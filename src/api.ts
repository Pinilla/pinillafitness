import type { IncomingMessage } from "node:http";
import type { Account, Accounts } from "./accounts.ts";
import { ok, problem, readJson, type Reply } from "./http.ts";
import type { createLogin } from "./login.ts";
import type { Reminders } from "./reminders.ts";

type Login = ReturnType<typeof createLogin>;
type Request = {
  req: IncomingMessage;
  url: URL;
  match: RegExpExecArray;
  username: string;
  account: Account;
};
type Route = { method: string; path: RegExp; handle(request: Request): Promise<Reply> };
type Parts = { login: Login; accounts: Accounts; reminders: Reminders };

export function createApi({ login, accounts, reminders }: Parts) {
  const routes: Route[] = [
    { method: "GET", path: /^\/api\/me$/, handle: async ({ username }) => ok({ username }) },
    { method: "GET", path: /^\/api\/checkins$/, handle: listCheckIns },
    { method: "PUT", path: /^\/api\/checkins\/([\d-]+)$/, handle: saveCheckIn },
    {
      method: "GET",
      path: /^\/api\/times$/,
      handle: async ({ account }) => ok(account.times.get()),
    },
    { method: "PUT", path: /^\/api\/times$/, handle: saveTimes },
    { method: "GET", path: /^\/api\/lifts$/, handle: listLifts },
    {
      method: "GET",
      path: /^\/api\/lifts\/([\d-]+)$/,
      handle: async ({ match, account }) => resultReply(account.lifts.workout(match[1]!)),
    },
    { method: "PUT", path: /^\/api\/lifts\/([\d-]+)$/, handle: saveLifts },
    { method: "GET", path: /^\/api\/reminders$/, handle: async () => ok(reminders.info()) },
    { method: "POST", path: /^\/api\/reminders\/subscribe$/, handle: subscribe },
    { method: "POST", path: /^\/api\/reminders\/unsubscribe$/, handle: unsubscribe },
    { method: "POST", path: /^\/api\/reminders\/test$/, handle: sendTest },
  ];

  async function listCheckIns({ url, account }: Request) {
    return resultReply(
      account.checkIns.range(url.searchParams.get("from"), url.searchParams.get("to")),
    );
  }

  async function saveCheckIn({ req, match, account }: Request) {
    return resultReply(await account.checkIns.save(match[1]!, await readJson(req)));
  }

  async function saveTimes({ req, account }: Request) {
    return resultReply(await account.times.save(await readJson(req)));
  }

  async function listLifts({ url, account }: Request) {
    return resultReply(
      account.lifts.range(url.searchParams.get("from"), url.searchParams.get("to")),
    );
  }

  async function saveLifts({ req, match, account }: Request) {
    return resultReply(await account.lifts.save(match[1]!, await readJson(req)));
  }

  async function subscribe({ req, username }: Request) {
    return resultReply(await reminders.subscribe(username, await readJson(req)));
  }

  async function unsubscribe({ req, username }: Request) {
    return resultReply(await reminders.unsubscribe(username, await readJson(req)));
  }

  async function sendTest({ username }: Request) {
    return resultReply(await reminders.sendTest(username), 409);
  }

  async function logIn(req: IncomingMessage) {
    const result = await login.attempt(req, await readJson(req));
    if ("error" in result) {
      return problem(result.status, result.error);
    }
    return ok({ username: result.username }, { "set-cookie": result.cookie });
  }

  async function routeForUser(req: IncomingMessage, url: URL) {
    const username = login.userOf(req);
    if (!username) {
      return problem(401, "Log in first.");
    }
    for (const route of routes) {
      const match = route.path.exec(url.pathname);
      if (match && route.method === req.method) {
        return route.handle({ req, url, match, username, account: await accounts.get(username) });
      }
    }
    return problem(404, "not found");
  }

  return async function handleApi(req: IncomingMessage, url: URL): Promise<Reply> {
    if (url.pathname === "/api/login" && req.method === "POST") {
      return logIn(req);
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      return ok({ loggedOut: true }, { "set-cookie": login.logoutCookie(req) });
    }
    return routeForUser(req, url);
  };
}

function resultReply(result: object, errorStatus = 400): Reply {
  if ("error" in result) {
    return problem(errorStatus, String(result.error));
  }
  return ok(result);
}
