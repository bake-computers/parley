import { lazy, Suspense } from "react";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { Trophy, Swords, Target, Percent } from "lucide-react";
import { ProfileShell } from "#/components/profile/ProfileShell";
import { RecentMatches } from "#/components/profile/RecentMatches";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { publicCache } from "#/lib/http-cache";
import { discordAvatarUrl } from "#/lib/discord/oauth";
import {
  formatElo,
  formatKd,
  formatWinRate,
  parleyRankForElo,
} from "#/lib/profile/parley-rank";
import { profileJsonLd, profilePageHead, serializeJsonLd } from "#/lib/profile/head";
import { getPublicProfile } from "#/lib/profile/server";
import type { GetPublicProfileResult, PublicProfileJson } from "#/lib/profile/rpc";

// Heavy charting libs — load only when there is history to draw.
const EloHistoryChart = lazy(() =>
  import("#/components/profile/EloHistoryChart").then((m) => ({ default: m.EloHistoryChart })),
);

/**
 * Public profiles live at /@{discordUsername}. Other single-segment paths
 * (e.g. /dashboard) are claimed by more specific routes and never reach here.
 */
export const Route = createFileRoute("/$handle")({
  headers: () => publicCache(30, 0, "page:profile"),
  loader: async ({ params }): Promise<GetPublicProfileResult> => {
    const handle = params.handle ?? "";
    if (!handle.startsWith("@") || handle.length < 3) {
      throw notFound();
    }
    const username = handle.slice(1);
    let result: GetPublicProfileResult;
    try {
      result = await getPublicProfile({ data: username });
    } catch {
      throw notFound();
    }
    if (result.kind === "not_found") {
      throw notFound();
    }
    if (result.kind === "redirect") {
      throw redirect({
        to: "/$handle",
        params: { handle: `@${result.username}` },
        statusCode: 301,
      });
    }
    return result;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {};
    }
    if (loaderData.kind === "private") {
      const display = loaderData.profile.globalName || loaderData.profile.username;
      return profilePageHead({
        username: loaderData.profile.username || (params.handle ?? "").replace(/^@/u, ""),
        displayName: display,
        description: "This Parley profile is private.",
        noindex: true,
      });
    }
    if (loaderData.kind === "public") {
      const p = loaderData.profile;
      const display = p.globalName || p.username;
      const tier = parleyRankForElo(p.internalElo);
      return profilePageHead({
        username: p.username,
        displayName: display,
        description: `${display} is ${tier.label} (${formatElo(p.internalElo)}) on Parley — ${p.wins}W ${p.losses}L across ${p.matches} matches.`,
      });
    }
    return {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  const data = Route.useLoaderData();

  if (data.kind === "private") {
    return <PrivateProfile profile={data.profile} />;
  }
  if (data.kind === "public") {
    return <PublicProfileView profile={data.profile} />;
  }
  return null;
}

function PrivateProfile({
  profile,
}: {
  profile: {
    discordUserId: string;
    username: string;
    globalName: string;
    avatarHash: string;
  };
}) {
  const display = profile.globalName || profile.username;
  const avatar = discordAvatarUrl(profile.discordUserId, profile.avatarHash || null, 128);

  return (
    <ProfileShell
      hero={
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <img
            src={avatar}
            alt=""
            width={96}
            height={96}
            className="ring-border/60 size-24 rounded-2xl ring-1"
          />
          <div>
            <p className="text-muted-foreground text-sm font-medium">Parley profile</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{display}</h1>
            <p className="text-muted-foreground mt-1 text-sm">@{profile.username}</p>
          </div>
        </div>
      }
    >
      <GlassPanel className="p-8">
        <p className="text-foreground text-base font-medium">This profile is private</p>
        <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
          {display} has chosen not to share their Parley stats publicly. Rank history and match
          results are hidden.
        </p>
      </GlassPanel>
    </ProfileShell>
  );
}

function PublicProfileView({ profile }: { profile: PublicProfileJson }) {
  const display = profile.globalName || profile.username;
  const avatar = discordAvatarUrl(profile.discordUserId, profile.avatarHash || null, 128);
  const tier = parleyRankForElo(profile.internalElo);
  const winRate = formatWinRate(profile.wins, profile.losses);
  const kd = formatKd(profile.kills, profile.deaths);
  const description = `${display} is ${tier.label} (${formatElo(profile.internalElo)}) on Parley.`;

  const stats = [
    {
      label: "Parley Rank",
      value: tier.label,
      sub: formatElo(profile.internalElo),
      icon: Trophy,
    },
    {
      label: "Record",
      value: `${profile.wins}W – ${profile.losses}L`,
      sub: `${profile.matches} matches`,
      icon: Swords,
    },
    {
      label: "Win rate",
      value: winRate,
      sub: "completed matches",
      icon: Percent,
    },
    {
      label: "K/D",
      value: kd,
      sub: `${profile.kills} / ${profile.deaths} / ${profile.assists}`,
      icon: Target,
    },
  ];

  return (
    <ProfileShell
      hero={
        <div className="flex flex-col gap-8">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: serializeJsonLd(
                profileJsonLd({
                  username: profile.username,
                  displayName: display,
                  description,
                  avatarUrl: avatar,
                }),
              ),
            }}
          />
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-5">
              <img
                src={avatar}
                alt=""
                width={96}
                height={96}
                className="ring-border/60 size-20 rounded-2xl ring-1 md:size-24"
              />
              <div>
                <p className="text-muted-foreground text-sm font-medium">Parley profile</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-5xl">
                  <span className="text-accent-silver">{display}</span>
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  @{profile.username}
                  {profile.identities[0] ? (
                    <span> · {profile.identities.map((i) => i.username).join(" / ")}</span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium">
              <span className="bg-accent-silver size-1.5 rounded-full" aria-hidden />
              {tier.label} · {formatElo(profile.internalElo)}
            </div>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Reveal key={stat.label}>
            <GlassPanel className="p-5">
              <div className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                <stat.icon className="size-3.5" aria-hidden />
                {stat.label}
              </div>
              <p className="text-foreground text-2xl font-semibold tracking-tight tabular-nums">
                {stat.value}
              </p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">{stat.sub}</p>
            </GlassPanel>
          </Reveal>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <GlassPanel as="section" className="p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-foreground text-sm font-medium">Rank history</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Parley Rank over time from completed matches
              </p>
            </div>
            {profile.ratingHistory.length >= 2 ? (
              <Suspense fallback={<div className="h-64" aria-hidden />}>
                <EloHistoryChart points={profile.ratingHistory} />
              </Suspense>
            ) : (
              <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
                {profile.ratingHistory.length === 1
                  ? `Current rank: ${formatElo(profile.ratingHistory[0]?.elo ?? 0)} — play matches to build history.`
                  : "No rank history yet."}
              </div>
            )}
          </GlassPanel>
        </Reveal>

        <Reveal>
          <GlassPanel as="section" className="p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-foreground text-sm font-medium">Linked accounts</h2>
              <p className="text-muted-foreground mt-1 text-xs">Rainbow Six Siege identities</p>
            </div>
            {profile.identities.length === 0 ? (
              <p className="text-muted-foreground text-sm">No linked game accounts.</p>
            ) : (
              <ul className="space-y-3">
                {profile.identities.map((id) => (
                  <li
                    key={`${id.platform}-${id.username}`}
                    className="border-border/50 flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{id.username}</p>
                      <p className="text-muted-foreground text-xs capitalize">{id.platform}</p>
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatElo(id.internalElo)} · {id.wins}W/{id.losses}L
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </Reveal>
      </div>

      <Reveal className="mt-6">
        <GlassPanel as="section" className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-foreground text-sm font-medium">Recent matches</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Completed Parley lobbies across all servers
            </p>
          </div>
          <RecentMatches matches={profile.recentMatches} />
        </GlassPanel>
      </Reveal>
    </ProfileShell>
  );
}
