import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "fitness-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true });
  }
}
