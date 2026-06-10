import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const pidDir = path.join(rootDir, ".alchemy", "pids");
const workerPorts = [8787, 8788, 8789, 8790, 8791, 8792] as const;

function killPid(pid: number): boolean {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

async function killPort(port: number): Promise<number> {
  const proc = Bun.spawn(["lsof", "-ti", `tcp:${port}`], { stdout: "pipe", stderr: "ignore" });
  const output = (await new Response(proc.stdout).text()).trim();
  await proc.exited;

  if (!output) {
    return 0;
  }

  return output
    .split("\n")
    .map((pidText) => Number(pidText))
    .filter((pid) => Number.isFinite(pid))
    .filter(killPid).length;
}

let stopped = 0;

try {
  const pidFiles = (await readdir(pidDir)).filter((file) => file.endsWith(".pid.json"));
  const pidResults = await Promise.all(
    pidFiles.map(async (file) => {
      const raw = await readFile(path.join(pidDir, file), "utf8");
      const pid = Number(JSON.parse(raw).pid);
      return Number.isFinite(pid) && killPid(pid);
    }),
  );
  stopped += pidResults.filter(Boolean).length;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const portResults = await Promise.all(workerPorts.map((port) => killPort(port)));
stopped += portResults.reduce((sum, count) => sum + count, 0);

if (stopped > 0) {
  console.log(`Stopped ${stopped} stale Alchemy dev process(es).`);
}
