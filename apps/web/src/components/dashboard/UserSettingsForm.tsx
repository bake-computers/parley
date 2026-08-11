import { useCallback, useMemo, useState } from "react";
import { Copy, ExternalLink, Globe, Lock, LogOut, RefreshCcw } from "lucide-react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import type { UserSettingsJson } from "#/lib/dashboard/user/types";
import { discordAvatarUrl } from "#/lib/discord/oauth";
import { cn } from "#/lib/shared/cn";
import { SaveStatus } from "./SaveStatus";
import { SettingsSearch } from "./SettingsSearch";
import { SettingsToggle } from "./SettingsField";

type AccountUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

type EntryMeta = { label: string; description: string; keywords: readonly string[] };

const PREFERENCE_META: Record<string, EntryMeta> = {
  matchmakingEnabled: {
    label: "Matchmaking enabled",
    description: "Join Parley matches on servers you play on.",
    keywords: ["queue", "match", "play", "enable"],
  },
  profilePublic: {
    label: "Public profile",
    description: "Show your Parley rank, match history, and stats on parley.bot/@you.",
    keywords: ["profile", "public", "private", "stats", "rank"],
  },
};

const PROFILE_META: Record<string, EntryMeta> = {
  displayName: {
    label: "Display name",
    description: "Your Discord display name shown on your public profile.",
    keywords: ["name", "display", "nickname"],
  },
  username: {
    label: "Username",
    description: "Your Discord username and profile URL handle.",
    keywords: ["handle", "url", "username", "@"],
  },
  discordUserId: {
    label: "Discord user ID",
    description: "Unique ID for your Discord account.",
    keywords: ["id", "discord", "snowflake"],
  },
};

function matchesQuery(query: string, meta: EntryMeta): boolean {
  const haystack = `${meta.label} ${meta.description} ${meta.keywords.join(" ")}`.toLowerCase();
  return haystack.includes(query);
}

function ProfilePreview({ user, profilePublic }: { user: AccountUser; profilePublic: boolean }) {
  const displayName = user.globalName ?? user.username;
  const avatar = discordAvatarUrl(user.id, user.avatar, 256);
  const handle = `@${user.username}`;

  return (
    <GlassPanel as="section" className="overflow-hidden">
      <div className="border-border/60 flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Profile preview</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            profilePublic
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {profilePublic ? (
            <>
              <Globe className="size-3.5" aria-hidden /> Public
            </>
          ) : (
            <>
              <Lock className="size-3.5" aria-hidden /> Private
            </>
          )}
        </span>
      </div>
      <div className="relative px-5 py-6">
        <div
          className={cn(
            "flex flex-col items-center gap-3 text-center transition-opacity",
            !profilePublic && "opacity-60",
          )}
        >
          <img
            src={avatar}
            alt=""
            width={96}
            height={96}
            className="size-24 rounded-full ring-2 ring-border"
          />
          <div>
            <p className="text-lg font-semibold tracking-tight">{displayName}</p>
            <p className="text-muted-foreground text-sm">{handle}</p>
          </div>
          {profilePublic ? (
            <p className="text-muted-foreground max-w-[16rem] text-xs leading-relaxed">
              Rank, match history, and stats are visible to anyone with the link.
            </p>
          ) : null}
        </div>
        {!profilePublic ? (
          <div className="absolute inset-x-5 bottom-6 flex justify-center">
            <p className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs">
              This profile is private
            </p>
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}

export function UserSettingsForm({
  user,
  settings,
  onSaved,
}: {
  user: AccountUser;
  settings: UserSettingsJson;
  onSaved: (next: UserSettingsJson) => void;
}) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const settingsKey = settingsBaselineKey(settings);

  const initial = useMemo(
    () => ({
      ...settings,
      matchmakingEnabled: settings.matchmakingEnabled ?? true,
      profilePublic: settings.profilePublic ?? true,
    }),
    [settingsKey],
  );

  const validate = useCallback(() => null, []);

  const section = useSettingsSection({
    initial,
    validate,
    onSaved,
    persist: { mode: "user" },
  });

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const showPreference = (key: string) =>
    !searching || matchesQuery(q, PREFERENCE_META[key]);
  const showProfile = (key: string) => !searching || matchesQuery(q, PROFILE_META[key]);
  const prefsVisible = Object.keys(PREFERENCE_META).some(showPreference);
  const profileVisible = Object.keys(PROFILE_META).some(showProfile);

  const displayName = user.globalName ?? user.username;
  const profilePath = `/@${user.username}`;
  const profileUrl =
    typeof window !== "undefined" ? `${window.location.origin}${profilePath}` : profilePath;

  const copyProfileUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — leave copied=false
    }
  };

  const readonlyRow = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <div className="sticky top-0 z-10 -mx-6 bg-background/95 px-6 py-3 backdrop-blur-sm">
          <SettingsSearch value={query} onChange={setQuery} />
        </div>

        {searching && !prefsVisible && !profileVisible ? (
          <GlassPanel className="p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No settings match “{query.trim()}”.
            </p>
          </GlassPanel>
        ) : null}

        {prefsVisible ? (
          <GlassPanel as="section" className="flex flex-col gap-2 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Preferences</h2>
                <p className="text-muted-foreground text-sm">
                  Personal preferences across all Parley servers.
                </p>
              </div>
              <SaveStatus status={section.status} />
            </div>
            {showPreference("matchmakingEnabled") ? (
              <SettingsToggle
                label={PREFERENCE_META.matchmakingEnabled.label}
                description={PREFERENCE_META.matchmakingEnabled.description}
                checked={section.draft.matchmakingEnabled}
                onChange={(v) => section.setToggle("matchmakingEnabled", v)}
              />
            ) : null}
            {showPreference("profilePublic") ? (
              <SettingsToggle
                label={PREFERENCE_META.profilePublic.label}
                description={PREFERENCE_META.profilePublic.description}
                checked={section.draft.profilePublic}
                onChange={(v) => section.setToggle("profilePublic", v)}
              />
            ) : null}
            {section.error ? <p className="text-destructive text-sm">{section.error}</p> : null}
          </GlassPanel>
        ) : null}

        {profileVisible ? (
          <GlassPanel as="section" className="flex flex-col gap-2 p-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
              <p className="text-muted-foreground text-sm">
                How you appear on your public profile page.
              </p>
            </div>
            {showProfile("displayName") ? readonlyRow("Display name", displayName) : null}
            {showProfile("username") ? readonlyRow("Username", `@${user.username}`) : null}
            {showProfile("discordUserId") ? readonlyRow("Discord user ID", user.id) : null}
            <div className="border-border/60 flex flex-wrap gap-2 border-t pt-4">
              <a
                href={profilePath}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              >
                <ExternalLink className="size-4" aria-hidden />
                Open public profile
              </a>
              <button
                type="button"
                onClick={() => void copyProfileUrl()}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              >
                <Copy className="size-4" aria-hidden />
                {copied ? "Copied!" : "Copy profile URL"}
              </button>
            </div>
          </GlassPanel>
        ) : null}

        <GlassPanel as="section" className="flex flex-col gap-3 p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Session</h2>
            <p className="text-muted-foreground text-sm">
              Signed in as <span className="font-medium">{displayName}</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            >
              <RefreshCcw className="size-4" aria-hidden />
              Back to servers
            </a>
            <a
              href="/auth/logout"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </a>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Parley stores your Discord ID, username, and match history to power ranks and
            matchmaking. See the{" "}
            <a
              href="/privacy"
              className="text-primary underline-offset-2 hover:underline"
            >
              privacy policy
            </a>{" "}
            for details.
          </p>
        </GlassPanel>
      </div>

      <aside className="min-w-0">
        <div className="lg:sticky lg:top-0">
          <ProfilePreview user={user} profilePublic={section.draft.profilePublic} />
        </div>
      </aside>
    </div>
  );
}
