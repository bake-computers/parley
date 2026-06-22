import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = join(__dirname, "..");
const heroDir = join(landingRoot, "public/assets/hero");
const foundersDir = join(landingRoot, "public/assets/founders");

function cwebp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("cwebp", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`cwebp exit ${code}`))));
  });
}

async function optimizeHero(source: string) {
  await mkdir(heroDir, { recursive: true });
  await cwebp(["-q", "75", "-resize", "1280", "720", source, "-o", join(heroDir, "hero-cinematic-1280.webp")]);
  await cwebp(["-q", "72", "-resize", "768", "432", source, "-o", join(heroDir, "hero-cinematic-768.webp")]);
  await cwebp(["-q", "75", "-resize", "1280", "720", source, "-o", join(landingRoot, "public/assets/hero-cinematic.webp")]);
}

async function optimizeFounder(slug: string) {
  const source = join(foundersDir, `${slug}.webp`);
  await cwebp(["-q", "80", "-resize", "64", "64", source, "-o", join(foundersDir, `${slug}-64.webp`)]);
  await cwebp(["-q", "82", "-resize", "128", "128", source, "-o", join(foundersDir, `${slug}-128.webp`)]);
}

async function main() {
  const heroSource = process.argv[2] ?? join(landingRoot, "public/assets/hero-cinematic.webp");
  await optimizeHero(heroSource);
  for (const slug of ["ryzm", "co-founder"]) {
    await optimizeFounder(slug);
  }
  console.log("Assets optimized.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});