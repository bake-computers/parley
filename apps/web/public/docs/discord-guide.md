# Parley for Discord users

> The five-minute visual guide to Parley in Discord: link your account, check your rank, and play
> balanced matches. This is the plain-markdown version of
> [https://parley.bot/docs/discord-guide](https://parley.bot/docs/discord-guide), published for AI
> crawlers and other agents.

Parley is a Discord app for Rainbow Six Siege communities. It links your game account to your
Discord identity, rates your skill with the Parley Rank, builds balanced 5v5 teams from real
ratings, and runs tournaments. Everything happens inside Discord with slash commands; every reply
is ephemeral, so your accounts, settings, and match data never appear in the public channel.

## What Parley does on Discord

- **Links your Rainbow Six Siege account** to your Discord identity, one profile per platform (PC,
  Xbox, PlayStation).
- **Rates your skill** with the Parley Rank, seeded from your Siege rank and moved by Parley
  matches.
- **Builds balanced lobbies** from everyone's real ratings, so teams are settled before the
  argument starts.
- **Runs tournaments** with a share code you join straight from chat.

## 1 · Add Parley to your server

A server admin adds Parley from [https://parley.bot](https://parley.bot). It needs the Manage
Server permission and nothing else — there is no channel setup, no roles, no configuration before
players start using it.

## 2 · Link your account with /link

Type `/link` in any channel. Parley takes you straight into the linking wizard. Pick your platform,
enter your exact in-game name, and confirm.

![The /link wizard: pick a platform, type your in-game name, confirm.](https://parley.bot/assets/docs/link-wizard.svg)

After a moment you get a **You're Ready To Play** card with your Parley Rank, your profile level,
and your current Siege rank and RP. Full details, including what to do when a link fails, are on
the [link your account](https://parley.bot/docs/getting-started/link-your-account) page.

Which name to enter:

- **PC** — your Ubisoft Connect username (Steam players use their Ubisoft account name).
- **Xbox** — your Xbox gamertag.
- **PlayStation** — your PlayStation Network online ID.

You can link one profile per platform. Removing a link starts a re-link cooldown, shown on the
card, so ratings cannot be reset by hopping accounts.

## 3 · Check your rank with /profile

Run `/profile` to see every linked account with its platform and its Parley Rank on each. The rank
is Parley's own ladder — ten tiers from Iron (1,000 points) to Challenger (4,900 points) — and it
moves only when you play Parley matches. It never changes your Ubisoft rank, and ranked play in the
game never changes it.

![/profile lists each linked platform with its Parley Rank.](https://parley.bot/assets/docs/profile-card.svg)

The full ladder and how points move: [Parley Rank](https://parley.bot/docs/ranks-and-stats/parley-rank).

## 4 · Play a balanced match

When your server queues a match, Parley compares full rosters and picks the split with the closest
win odds on both sides. You see the teams, the scoreboard, and after the result is reported,
everyone's rating movement — including yours.

![Teams come pre-balanced from everyone's Parley Rank.](https://parley.bot/assets/docs/balanced-teams.svg)

Recent results live in `/history`, and `/team` runs the same balance for custom lobbies you pick
yourself.

## Key commands

| Command              | What it does                                  |
| -------------------- | --------------------------------------------- |
| `/link`              | Link your Discord to your in-game account     |
| `/profile`           | View your linked accounts and stats           |
| `/history`           | Show recent Parley matches in this server     |
| `/team`              | Run a balanced custom match with your lobby   |
| `/user`              | Manage matchmaking, visibility, and data      |
| `/tournament create` | Start a tournament on the Parley website      |
| `/tournament join`   | Open a tournament by its share code           |

## Go deeper

- [Commands](https://parley.bot/docs/commands) — every slash command at a glance.
- [Matchmaking](https://parley.bot/docs/matchmaking) — how balance works and why you might be left
  out.
- [Tournaments](https://parley.bot/docs/tournaments) — create or join a bracket with a share code.
- [Privacy and data](https://parley.bot/docs/privacy-and-data) — what is stored and how to delete
  it.
- [FAQ](https://parley.bot/docs/faq) — quick answers to common questions.
