import { readFile, writeFile, rename } from "node:fs/promises";

export type JsonFile<T> = {
  get(): T;
  set(value: T): Promise<void>;
};

export async function openJsonFile<T>(path: string, fallback: T): Promise<JsonFile<T>> {
  let value = await readOrFallback(path, fallback);
  let saving = Promise.resolve();
  return {
    get: () => value,
    set(next) {
      value = next;
      const text = JSON.stringify(next, null, 1);
      saving = saving.then(() => replaceFile(path, text));
      return saving;
    },
  };
}

async function readOrFallback<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function replaceFile(path: string, text: string) {
  await writeFile(path + ".tmp", text);
  await rename(path + ".tmp", path);
}
