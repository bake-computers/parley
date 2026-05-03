import { Shield } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { useGuildAccess } from "#/hooks/use-guild-access";

type AuthGuardProps = {
  guildId: string | null;
  children: React.ReactNode;
};

export function AuthGuard({ guildId, children }: AuthGuardProps) {
  const { adminGuilds, isGlobalAdmin, isLoading, error } = useGuildAccess();

  if (isLoading) {
    return (
      <section className="auth-panel">
        <Badge variant="outline" className="hq-badge">
          Checking access
        </Badge>
        <h1 className="auth-title">Verifying permissions</h1>
        <p className="auth-copy">Checking your Discord server permissions...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="auth-panel">
        <Badge variant="outline" className="hq-badge">
          Access error
        </Badge>
        <h1 className="auth-title">Unable to verify access</h1>
        <p className="auth-copy">
          Could not load your server permissions. Please try refreshing the page.
        </p>
        <Button className="hq-button h-11 px-5" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </section>
    );
  }

  if (guildId === null) {
    if (!isGlobalAdmin) {
      return (
        <section className="auth-panel">
          <Badge variant="outline" className="hq-badge">
            <Shield size={14} />
            Access denied
          </Badge>
          <h1 className="auth-title">Global access required</h1>
          <p className="auth-copy">
            Only global administrators can view all servers. Select a specific server instead.
          </p>
        </section>
      );
    }
    return <>{children}</>;
  }

  const hasAccess = isGlobalAdmin || adminGuilds.some((g) => g.id === guildId);

  if (!hasAccess) {
    return (
      <section className="auth-panel">
        <Badge variant="outline" className="hq-badge">
          <Shield size={14} />
          Access denied
        </Badge>
        <h1 className="auth-title">No admin access</h1>
        <p className="auth-copy">
          You do not have Administrator or Manage Server permission in this Discord server.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}
