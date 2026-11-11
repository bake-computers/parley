import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const __dirname = import.meta.dirname;
const webRoot = join(__dirname, "..");
const heroDir = join(webRoot, "public/assets/hero");

function cwebp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("cwebp", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`cwebp exit ${code}`))));
  });
}

async function optimizeHero(source: string) {
  await mkdir(heroDir, { recursive: true });
  await cwebp([
    "-q",
    "75",
    "-resize",
    "1280",
    "720",
    source,
    "-o",
    join(heroDir, "hero-cinematic-1280.webp"),
  ]);
  await cwebp([
    "-q",
    "72",
    "-resize",
    "768",
    "432",
    source,
    "-o",
    join(heroDir, "hero-cinematic-768.webp"),
  ]);
}

/** Responsive widths for the architecture diagram blog figure. */
async function optimizeArchitecture() {
  const source = join(webRoot, "public/assets/parley-architecture-overview.webp");
  await Promise.all(
    [800, 1280].map((width) =>
      cwebp([
        "-q",
        "80",
        "-resize",
        String(width),
        "0",
        source,
        "-o",
        join(webRoot, `public/assets/parley-architecture-overview-${width}.webp`),
      ]),
    ),
  );
}

async function main() {
  // Hero source was removed with the other raw assets; pass one explicitly to regenerate.
  const heroSource = process.argv[2];
  if (heroSource) {
    await optimizeHero(heroSource);
  }
  await optimizeArchitecture();
  console.log("Assets optimized.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
