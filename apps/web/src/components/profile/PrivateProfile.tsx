import { Lock } from "lucide-react";
import { ProfileShell } from "#/components/profile/ProfileShell";
import { GlassPanel } from "#/components/ui/glass-panel";
import { discordAvatarUrl } from "#/lib/discord/oauth";

type PrivateProfileProps = {
  profile: {
    discordUserId: string;
    username: string;
    globalName: string;
    avatarHash: string;
  };
};

export function PrivateProfile({ profile }: PrivateProfileProps) {
  const display = profile.globalName || profile.username;
  const avatar = discordAvatarUrl(profile.discordUserId, profile.avatarHash || null, 128);

  return (
    <ProfileShell
      hero={
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <img
            src={avatar}
            alt=""
            width={112}
            height={112}
            className="ring-border/60 size-24 shrink-0 rounded-2xl ring-1 md:size-28"
          />
          <div>
            <p className="text-muted-foreground text-sm font-medium">Parley profile</p>
            <h1 className="text-accent-silver mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              {display}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">@{profile.username}</p>
          </div>
        </div>
      }
    >
      <GlassPanel className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center">
        <span className="border-border/60 bg-muted/50 flex size-11 shrink-0 items-center justify-center rounded-xl border">
          <Lock className="text-muted-foreground size-5" aria-hidden />
        </span>
        <div>
          <p className="text-foreground text-base font-medium">This profile is private</p>
          <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">
            {display} has chosen not to share their Parley stats publicly. Rank history and match
            results are hidden.
          </p>
        </div>
      </GlassPanel>
    </ProfileShell>
  );
}
