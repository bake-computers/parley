import {
  DiscordActionRow,
  DiscordButton,
  DiscordContainer,
  DiscordSeparator,
  DiscordStringSelect,
  DiscordTextDisplay,
  DiscordUserSelect,
} from "@parley/discord-components";
import { DiscordDemo, DJS } from "./DiscordDemo";

/* ── /link ── */

export function LinkHubEmptyDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.success}>
        <DiscordTextDisplay content="**Link Your Accounts**" />
        <DiscordTextDisplay content="Connect Discord to **Rainbow Six Siege**. You can link **PC** plus **console** accounts (Xbox and PlayStation) — one profile per platform." />
        <DiscordSeparator />
        <DiscordTextDisplay content="_No accounts linked yet._" />
        <DiscordSeparator />
        <DiscordTextDisplay content="**Add a platform**" />
        <DiscordTextDisplay content="-# Select where you play, then enter your in-game username." />
        <DiscordActionRow>
          <DiscordStringSelect
            interactive
            placeholder="Choose a platform to link"
            options={[
              { label: "PC", value: "pc", description: "Ubisoft Connect on PC" },
              { label: "Xbox", value: "xbox", description: "Xbox console or PC Game Pass" },
              { label: "PlayStation", value: "playstation", description: "PlayStation console" },
            ]}
          />
        </DiscordActionRow>
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function LinkHubLinkedDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.indigo}>
        <DiscordTextDisplay content="**Link Your Accounts**" />
        <DiscordTextDisplay content="Connect Discord to **Rainbow Six Siege**. You can link **PC** plus **console** accounts (Xbox and PlayStation) — one profile per platform." />
        <DiscordSeparator />
        <DiscordTextDisplay content="**Linked accounts**" />
        <DiscordTextDisplay content={"**PC** · `Shroud`\nGold · 2,540"} />
        <DiscordSeparator />
        <DiscordTextDisplay content="**Add a platform**" />
        <DiscordTextDisplay content="-# Select where you play, then enter your in-game username." />
        <DiscordActionRow>
          <DiscordStringSelect
            placeholder="Choose a platform to link"
            options={[
              { label: "Xbox", value: "xbox", description: "Xbox console or PC Game Pass" },
              { label: "PlayStation", value: "ps", description: "PlayStation console" },
            ]}
          />
        </DiscordActionRow>
        <DiscordSeparator />
        <DiscordTextDisplay content="**Remove a link**" />
        <DiscordActionRow>
          <DiscordStringSelect
            placeholder="Select an account to remove"
            options={[{ label: "PC — Shroud", value: "pc", description: "Remove this linked account" }]}
          />
        </DiscordActionRow>
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function LinkConfirmDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.warning}>
        <DiscordTextDisplay content="**Confirm Your Account**" />
        <DiscordTextDisplay content="We'll look up your **PC** profile and link it to Discord." />
        <DiscordSeparator />
        <DiscordTextDisplay content={"**Platform**\nPC"} />
        <DiscordTextDisplay content={"**Username**\n`Shroud`"} />
        <DiscordTextDisplay content={"**Game**\nRainbow Six Siege"} />
        <DiscordSeparator />
        <DiscordTextDisplay content="**Next step**" />
        <DiscordTextDisplay content="-# Choose **Continue** to link, or **Go back** to pick another platform." />
        <DiscordActionRow>
          <DiscordStringSelect
            interactive
            placeholder="Confirm or go back"
            options={[
              {
                label: "Continue — link this account",
                value: "continue",
                description: "Link Shroud on PC",
              },
              { label: "Go back", value: "back", description: "Return to account overview" },
            ]}
          />
        </DiscordActionRow>
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function LinkFetchingDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.success}>
        <DiscordTextDisplay content="**Fetching Your Stats**" />
        <DiscordSeparator />
        <DiscordTextDisplay content="Account linked. Pulling your stats from stats.cc — this can take a moment." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function LinkReadyDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.success}>
        <DiscordTextDisplay content="**You're Ready To Play**" />
        <DiscordSeparator />
        <DiscordTextDisplay content="### Rainbow Six Siege · PC" />
        <DiscordTextDisplay content={"**Username**\n`Shroud`"} />
        <DiscordTextDisplay content={"**Player ID**\n`1042`"} />
        <DiscordSeparator />
        <DiscordTextDisplay content={"**Parley Rank**\nGold · 2,540"} />
        <DiscordTextDisplay content={"**Profile**\nLevel 187"} />
        <DiscordTextDisplay content={"**Current Rank**\nGold · 3,120 RP"} />
        <DiscordSeparator />
        <DiscordTextDisplay content="-# Run `/link` again or use **Add a platform** to connect another profile." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function LinkFailedDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.error}>
        <DiscordTextDisplay content="**Link Failed**" />
        <DiscordSeparator />
        <DiscordTextDisplay content="Could not find that username on PC. Check the spelling and try again." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

/* ── /profile ── */

export function ProfileEmptyDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**No Linked Accounts**" />
        <DiscordTextDisplay content="No accounts linked. Use /link to get started!" />
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function ProfileLinkedDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Your Linked Accounts**" />
        <DiscordTextDisplay
          content={`**Rainbow Six Siege** · PC · \`Shroud\`
Gold · 2,540

**Rainbow Six Siege** · Xbox · \`ShroudXbox\`
Silver · 1,890`}
        />
      </DiscordContainer>
    </DiscordDemo>
  );
}

/* ── /history ── */

export function HistoryEmptyDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Match History**" />
        <DiscordSeparator />
        <DiscordTextDisplay content="**No matches played yet**" />
        <DiscordTextDisplay content="-# Once your team plays matches, they'll show up here." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function HistoryMatchDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Match History** — Page **1** of **5**" />
        <DiscordTextDisplay content="-# Match #1284 · Played 2 hours ago" />
        <DiscordSeparator />
        <DiscordTextDisplay
          content={`**Team A — winner**
Alex — \`8/3/2\` (+18)
Sam — \`5/4/4\` (+14)
Jordan — \`3/5/6\` (+12)`}
        />
        <DiscordSeparator />
        <DiscordTextDisplay
          content={`**Team B**
Casey — \`6/6/1\` (-12)
Riley — \`4/5/3\` (-14)
Morgan — \`2/7/2\` (-16)`}
        />
        <DiscordSeparator />
        <DiscordTextDisplay content="-# **MVP** Alex" />
      </DiscordContainer>
      <DiscordActionRow>
        <DiscordButton style="secondary" disabled>
          Previous
        </DiscordButton>
        <DiscordButton style="secondary">Next</DiscordButton>
      </DiscordActionRow>
    </DiscordDemo>
  );
}

/* ── /user ── */

export function UserPreferencesDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="# Your Settings" />
        <DiscordTextDisplay content="Page **1** / **2** · Preferences" />
        <DiscordSeparator />
        <DiscordTextDisplay content="## Matchmaking" />
        <DiscordTextDisplay content="Join the ranked queue, or pause it." />
        <DiscordActionRow>
          <DiscordStringSelect
            interactive
            placeholder="Matchmaking status"
            options={[
              { label: "Enabled", value: "on", default: true },
              { label: "Disabled", value: "off" },
            ]}
          />
        </DiscordActionRow>
        <DiscordSeparator />
        <DiscordTextDisplay content="## Visibility" />
        <DiscordTextDisplay content="Control who sees your profile and stats." />
        <DiscordActionRow>
          <DiscordStringSelect
            interactive
            placeholder="Profile visibility"
            options={[
              { label: "Public", value: "public", default: true },
              { label: "Hidden", value: "hidden" },
            ]}
          />
        </DiscordActionRow>
      </DiscordContainer>
      <DiscordActionRow>
        <DiscordButton style="secondary" disabled>
          Back
        </DiscordButton>
        <DiscordButton style="primary">Privacy</DiscordButton>
      </DiscordActionRow>
    </DiscordDemo>
  );
}

export function UserPrivacyDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="# Privacy & Data" />
        <DiscordTextDisplay content="Page **2** / **2** · Stats · Account data" />
        <DiscordSeparator />
        <DiscordTextDisplay content="Re-link cooldown · none" />
        <DiscordSeparator />
        <DiscordTextDisplay content="## Stats snapshot" />
        <DiscordTextDisplay content="Pull the latest data from the stats provider." />
        <DiscordSeparator />
        <DiscordTextDisplay content="## Your data" />
        <DiscordTextDisplay content="Anonymize all Parley records. 30-day re-link cooldown." />
      </DiscordContainer>
      <DiscordActionRow>
        <DiscordButton style="primary">Refresh stats</DiscordButton>
        <DiscordButton style="danger">Delete my data</DiscordButton>
        <DiscordButton style="secondary">Preferences</DiscordButton>
      </DiscordActionRow>
    </DiscordDemo>
  );
}

export function UserDeletedDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.error}>
        <DiscordTextDisplay content="**Data Deleted**" />
        <DiscordSeparator />
        <DiscordTextDisplay content="Your Parley records were anonymized. You can link again after the cooldown." />
        <DiscordTextDisplay content={"**Cooldown ends**\nIn 30 days"} />
        <DiscordTextDisplay
          content={"**Tables affected**\nplayers · identities · matches · tournaments"}
        />
      </DiscordContainer>
    </DiscordDemo>
  );
}

/* ── /tournament ── */

export function TournamentCreateDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Create a tournament**" />
        <DiscordTextDisplay content="Use the [Parley website](https://parley.bot/tournaments/create). Log in to choose the format, schedule, rules, and prizes." />
        <DiscordTextDisplay content="-# This link expires in **10 minutes** and only works for you in this server." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

export function TournamentJoinDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Open Cup — Summer**" />
        <DiscordTextDisplay content="Status: **Registration open**" />
        <DiscordTextDisplay content="Open the [tournament page](https://parley.bot/tournaments/ABC123XYZ4) to join with Discord and pick your team." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

/* ── /team ── */

export function TeamSetupDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Custom Match**" />
        <DiscordSeparator />
        <DiscordTextDisplay content="Pick **2–10** players (even number) and Parley assembles balanced teams." />
      </DiscordContainer>
      <DiscordActionRow>
        <DiscordUserSelect placeholder="Pick players" />
      </DiscordActionRow>
    </DiscordDemo>
  );
}

export function TeamScoreboardDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Custom Match** — #42" />
        <DiscordTextDisplay content="-# Log each round as it ends; K/D/A totals update below." />
        <DiscordSeparator />
        <DiscordTextDisplay
          content={`**Team A**
Alex — \`4/2/1\`
Sam — \`2/3/2\`
Jordan — \`1/2/3\``}
        />
        <DiscordSeparator />
        <DiscordTextDisplay
          content={`**Team B**
Casey — \`3/3/0\`
Riley — \`2/2/1\`
Morgan — \`1/3/2\``}
        />
      </DiscordContainer>
      <DiscordActionRow>
        <DiscordButton style="primary">Log round — Team A</DiscordButton>
        <DiscordButton style="primary">Log round — Team B</DiscordButton>
        <DiscordButton style="danger">End match</DiscordButton>
      </DiscordActionRow>
    </DiscordDemo>
  );
}

export function TeamEndDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.warning}>
        <DiscordTextDisplay content="**End match**\nWhich team won?" />
      </DiscordContainer>
      <DiscordActionRow>
        <DiscordButton style="primary">Team A wins</DiscordButton>
        <DiscordButton style="primary">Team B wins</DiscordButton>
      </DiscordActionRow>
    </DiscordDemo>
  );
}

export function TeamFinalDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Custom Match** — #42" />
        <DiscordSeparator />
        <DiscordTextDisplay
          content={`**Team A — winner**
Alex — \`12/5/4\`
Sam — \`8/7/6\`
Jordan — \`5/6/8\``}
        />
        <DiscordSeparator />
        <DiscordTextDisplay
          content={`**Team B**
Casey — \`9/9/2\`
Riley — \`6/8/4\`
Morgan — \`4/10/3\``}
        />
        <DiscordSeparator />
        <DiscordTextDisplay content="-# Ratings updated. Find this match in `/history`." />
      </DiscordContainer>
    </DiscordDemo>
  );
}

/* ── /help ── */

export function HelpDemo() {
  return (
    <DiscordDemo>
      <DiscordContainer accentColor={DJS.main}>
        <DiscordTextDisplay content="**Parley Commands**" />
        <DiscordTextDisplay content="`/link` — Link your game accounts" />
        <DiscordTextDisplay content="`/profile` — View linked accounts & rank" />
        <DiscordTextDisplay content="`/history` — Your recent matches in this server" />
        <DiscordTextDisplay content="`/user` — Matchmaking & privacy settings" />
        <DiscordTextDisplay content="`/team` — Custom balanced match" />
        <DiscordTextDisplay content="`/tournament` — Create or join a tournament" />
        <DiscordTextDisplay content="`/ping` — Check if the bot is up" />
      </DiscordContainer>
    </DiscordDemo>
  );
}
