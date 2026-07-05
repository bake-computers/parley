import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = join(__dirname, "..");
const foundersDir = join(landingRoot, "public/assets/founders");
const foundersConfigPath = join(landingRoot, "src/lib/founders.ts");

const FOUNDER_ENTRIES = [
  { id: "980859238630948886", slug: "ryzm", role: "Founder" as const },
  { id: "1019159791886671872", slug: "co-founder", role: "Co-founder" as const },
];

type DiscordUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

async function loadBotToken(): Promise<string> {
  const envPath = join(landingRoot, "../../.env");
  const envContents = await readFile(envPath, "utf8");
  const match = envContents.match(/^DISCORD_BOT_TOKEN="?([^"\n]+)"?/m);
  if (!match?.[1]) {
    throw new Error("DISCORD_BOT_TOKEN not found in repo .env");
  }
  return match[1];
}

async function fetchDiscordUser(token: string, userId: string): Promise<DiscordUser> {
  const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} for user ${userId}`);
  }
  return response.json() as Promise<DiscordUser>;
}

function cwebp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("cwebp", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`cwebp exit ${code}`))));
  });
}

function avatarUrl(user: DiscordUser, size = 128): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
  }
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function displayHandle(user: DiscordUser): string {
  return user.global_name ?? user.username;
}

async function main() {
  const token = await loadBotToken();
  await mkdir(foundersDir, { recursive: true });

  const resolved: Array<{
    id: string;
    handle: string;
    role: "Founder" | "Co-founder";
    avatarSrc: string;
    slug: string;
  }> = [];

  for (const entry of FOUNDER_ENTRIES) {
    const user = await fetchDiscordUser(token, entry.id);
    const handle = entry.slug === "ryzm" ? "ryzm" : displayHandle(user);
    const avatarResponse = await fetch(avatarUrl(user));
    if (!avatarResponse.ok) {
      throw new Error(`Failed to download avatar for ${entry.id}`);
    }

    const rawPath = join(foundersDir, `${entry.slug}-raw.png`);
    await writeFile(rawPath, Buffer.from(await avatarResponse.arrayBuffer()));
    const outPath = join(foundersDir, `${entry.slug}.webp`);
    await cwebp(["-q", "82", "-resize", "128", "128", rawPath, "-o", outPath]);
    await cwebp([
      "-q",
      "80",
      "-resize",
      "64",
      "64",
      rawPath,
      "-o",
      join(foundersDir, `${entry.slug}-64.webp`),
    ]);
    await cwebp([
      "-q",
      "82",
      "-resize",
      "128",
      "128",
      rawPath,
      "-o",
      join(foundersDir, `${entry.slug}-128.webp`),
    ]);
    resolved.push({
      id: entry.id,
      handle,
      role: entry.role,
      avatarSrc: `/assets/founders/${entry.slug}.webp`,
      slug: entry.slug,
    });
    console.log(`Cached ${handle} → ${entry.slug}.webp`);
  }

  const configSource = `export type Founder = {
  id: string;
  handle: string;
  role: "Founder" | "Co-founder";
  avatarSrc: string;
};

export const founders: readonly Founder[] = [
${resolved
  .map(
    (f) => `  {
    id: "${f.id}",
    handle: "${f.handle}",
    role: "${f.role}",
    avatarSrc: "${f.avatarSrc}",
  }`,
  )
  .join(",\n")},
] as const;
`;

  await writeFile(foundersConfigPath, configSource);
  console.log("Updated src/lib/founders.ts");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
