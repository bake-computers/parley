import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { PrivateProfile } from "#/components/profile/PrivateProfile";
import { PublicProfile } from "#/components/profile/PublicProfile";
import { publicCache } from "#/lib/http-cache";
import {
  formatElo,
  parleyRankForElo,
} from "#/lib/profile/parley-rank";
import { profilePageHead } from "#/lib/profile/head";
import { getPublicProfile } from "#/lib/profile/server";
import type { GetPublicProfileResult } from "#/lib/profile/rpc";

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
    return <PublicProfile profile={data.profile} />;
  }
  return null;
}
