import { createInterface } from "node:readline/promises";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openUsers } from "./users.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.FITNESS_DATA ?? join(ROOT, "data");

async function readPassword() {
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    lines.close();
    return line;
  }
  return "";
}

async function addUser(username: string | undefined) {
  if (!username) {
    throw new Error("Usage: node src/add-user.ts <username>, with the password on standard input.");
  }
  await mkdir(DATA, { recursive: true });
  const users = await openUsers(join(DATA, "users.json"));
  const existed = users.exists(username);
  await users.add(username, await readPassword());
  console.log(
    `${existed ? "Changed the password for" : "Added"} ${username}. Restart pinillafitness to use it.`,
  );
}

addUser(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
