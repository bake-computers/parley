import { lazy, Suspense } from "react";
import { ProfileShell } from "#/components/profile/ProfileShell";
import { RecentMatches } from "#/components/profile/RecentMatches";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { discordAvatarUrl } from "#/lib/discord/oauth";
import {
  formatElo,
  formatKd,
  formatWinRate,
  parleyRankForElo,
} from "#/lib/profile/parley-rank";
import { profileJsonLd, serializeJsonLd } from "#/lib/profile/head";
import type { PublicProfileJson } from "#/lib/profile/rpc";
import { nextTierProgress, tierAccent, type TierAccent } from "#/lib/profile/tier-style";

// Heavy charting libs — load only when there is history to draw.
const EloHistoryChart = lazy(() =>
  import("#/components/profile/EloHistoryChart").then((m) => ({ default: m.EloHistoryChart })),
);

type PublicProfileProps = {
  profile: PublicProfileJson;
};

export function PublicProfile({ profile }: PublicProfileProps) {
  const display = profile.globalName || profile.username;
  const avatar = discordAvatarUrl(profile.discordUserId, profile.avatarHash || null, 128);
  const tier = parleyRankForElo(profile.internalElo);
  const accent = tierAccent(tier.id);
  const memberSince =
    profile.memberSinceMs > 0
      ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
          new Date(profile.memberSinceMs),
        )
      : null;
  const description = `${display} is ${tier.label} (${formatElo(profile.internalElo)}) on Parley.`;

  return (
    <ProfileShell
      hero={
        <div>
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
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <img
                src={avatar}
                alt=""
                width={112}
                height={112}
                className="size-24 shrink-0 rounded-2xl md:size-28"
                style={{
                  boxShadow: `0 0 0 1px ${accent.color}55, 0 0 32px -6px ${accent.glow}`,
                }}
              />
              <div>
                <p className="text-muted-foreground text-sm font-medium">Parley profile</p>
                <h1 className="text-accent-silver mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                  {display}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">@{profile.username}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {profile.identities.map((id) => (
                    <span
                      key={`${id.platform}-${id.username}`}
                      className="glass-chip text-muted-foreground px-2.5 py-1 text-xs"
                    >
                      <span className="capitalize">{id.platform}</span> · {id.username}
                    </span>
                  ))}
                  {memberSince ? (
                    <span className="glass-chip text-muted-foreground px-2.5 py-1 text-xs">
                      Member since {memberSince}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <RankPlate elo={profile.internalElo} tierLabel={tier.label} accent={accent} />
          </div>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <CareerCard profile={profile} />
        </Reveal>
        <Reveal delay={80}>
          <PerformanceCard profile={profile} />
        </Reveal>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Reveal>
          <RankHistoryCard profile={profile} />
        </Reveal>
        <Reveal delay={80}>
          <LinkedAccountsCard profile={profile} />
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

function RankPlate({
  elo,
  tierLabel,
  accent,
}: {
  elo: number;
  tierLabel: string;
  accent: TierAccent;
}) {
  const progress = nextTierProgress(elo);
  const atPeak = progress.pointsToNext === null;

  return (
    <GlassPanel className="w-full shrink-0 p-5 lg:w-72">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Parley Rank
          </p>
          <p className="mt-1 text-sm font-medium" style={{ color: accent.color }}>
            {tierLabel}
          </p>
        </div>
        <p className="text-foreground text-4xl font-semibold tracking-tight tabular-nums">
          {formatElo(elo)}
        </p>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">
            {atPeak ? "Peak ladder" : `Next: ${progress.next}`}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {atPeak ? "—" : `${progress.pointsToNext} to go`}
          </span>
        </div>
        <div className="bg-muted h-1 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(progress.progress01 * 100)}%`,
              backgroundColor: accent.color,
              boxShadow: `0 0 10px ${accent.glow}`,
            }}
          />
        </div>
      </div>
    </GlassPanel>
  );
}

function CareerCard({ profile }: { profile: PublicProfileJson }) {
  return (
    <GlassPanel as="section" className="flex h-full flex-col p-6 md:p-8">
      <div className="text-muted-foreground mb-6 text-xs font-medium tracking-wide uppercase">
        Career
      </div>

      <p className="text-5xl font-semibold tracking-tight tabular-nums">
        <span className="text-emerald-400">{profile.wins}W</span>
        <span className="text-muted-foreground"> – </span>
        <span className="text-rose-400">{profile.losses}L</span>
      </p>
      <p className="text-muted-foreground mt-1 text-sm tabular-nums">
        {profile.matches} {profile.matches === 1 ? "match" : "matches"}
      </p>

      <p className="text-muted-foreground mt-auto border-t border-border/50 pt-6 text-xs">
        Completed Parley matches
      </p>
    </GlassPanel>
  );
}

function PerformanceCard({ profile }: { profile: PublicProfileJson }) {
  const winRate = formatWinRate(profile.wins, profile.losses);
  const kd = formatKd(profile.kills, profile.deaths);
  const total = profile.wins + profile.losses;
  const winShare = total > 0 ? (profile.wins / total) * 100 : 0;

  return (
    <GlassPanel as="section" className="flex h-full flex-col p-6 md:p-8">
      <div className="text-muted-foreground mb-6 text-xs font-medium tracking-wide uppercase">
        Performance
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-foreground text-4xl font-semibold tracking-tight tabular-nums">
            {winRate}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Win rate</p>
        </div>
        <p className="text-muted-foreground pb-1 text-xs tabular-nums">
          {profile.wins}W – {profile.losses}L
        </p>
      </div>
      <div className="bg-muted mt-4 flex h-1.5 overflow-hidden rounded-full">
        {total > 0 ? (
          <>
            <div className="bg-emerald-400/70 h-full" style={{ width: `${winShare}%` }} />
            <div className="bg-rose-400/70 h-full" style={{ width: `${100 - winShare}%` }} />
          </>
        ) : null}
      </div>

      <div className="mt-auto border-t border-border/50 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-foreground text-4xl font-semibold tracking-tight tabular-nums">
              {kd}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">K/D</p>
          </div>
          <p className="text-muted-foreground pb-1 text-xs tabular-nums">
            {profile.kills} K · {profile.deaths} D · {profile.assists} A
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}

function RankHistoryCard({ profile }: { profile: PublicProfileJson }) {
  return (
    <GlassPanel as="section" className="p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-foreground text-sm font-medium">Rank history</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Parley Rank over time from completed matches
        </p>
      </div>
      {profile.ratingHistory.length >= 2 ? (
        <Suspense fallback={<div className="h-[280px]" aria-hidden />}>
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
  );
}

function LinkedAccountsCard({ profile }: { profile: PublicProfileJson }) {
  return (
    <GlassPanel as="section" className="p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-foreground text-sm font-medium">Linked accounts</h2>
        <p className="text-muted-foreground mt-1 text-xs">Rainbow Six Siege identities</p>
      </div>
      {profile.identities.length === 0 ? (
        <p className="text-muted-foreground text-sm">No linked game accounts.</p>
      ) : (
        <ul className="space-y-4">
          {profile.identities.map((id) => (
            <li
              key={`${id.platform}-${id.username}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="glass-chip text-muted-foreground px-2.5 py-1 text-[11px] font-medium capitalize">
                  {id.platform}
                </span>
                <p className="text-foreground truncate text-sm font-medium">{id.username}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-foreground text-xs font-medium tabular-nums">
                  {formatElo(id.internalElo)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                  {id.wins}W – {id.losses}L
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
