import { join } from "node:path";
import { HOLD_LIMITS, isAllowedHold, stretchIds } from "../public/routines.js";
import { openJsonFile } from "./json-file.ts";

export type Times = Record<string, number>;
export type TimeBook = {
  get(): Times;
  save(body: unknown): Promise<{ times: Times } | { error: string }>;
};

export async function openTimes(dir: string): Promise<TimeBook> {
  const file = await openJsonFile<Times>(join(dir, "times.json"), {});

  return {
    get() {
      return file.get();
    },
    async save(body) {
      const read = readTimes(body);
      if ("error" in read) {
        return read;
      }
      await file.set({ ...file.get(), ...read.times });
      return { times: file.get() };
    },
  };
}

function readTimes(body: unknown): { times: Times } | { error: string } {
  const times = (body as { times?: unknown } | null)?.times;
  if (!times || typeof times !== "object" || Array.isArray(times)) {
    return { error: "times must be an object." };
  }
  const known = new Set(stretchIds());
  for (const [id, seconds] of Object.entries(times)) {
    if (!known.has(id)) {
      return { error: `${id} isn't a stretch.` };
    }
    if (!isAllowedHold(seconds)) {
      return { error: holdLimitsMessage() };
    }
  }
  return { times: times as Times };
}

function holdLimitsMessage() {
  const { min, max, step } = HOLD_LIMITS;
  return `Times must be from ${min} to ${max} seconds, in steps of ${step}.`;
}
