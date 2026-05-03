import { Globe, Server } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { GuildInfo } from "#/hooks/use-guild-access";

type GuildSelectorProps = {
  adminGuilds: GuildInfo[];
  isGlobalAdmin: boolean;
  onSelect: (guildId: string | null) => void;
};

function guildIconUrl(guildId: string, iconHash: string): string {
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png`;
}

function GuildCard({ guild, onSelect }: { guild: GuildInfo; onSelect: () => void }) {
  return (
    <Card className="hq-card guild-card">
      <CardHeader className="space-y-2">
        <div className="guild-card-icon-row">
          {guild.icon ? (
            <img
              src={guildIconUrl(guild.id, guild.icon)}
              alt=""
              width={40}
              height={40}
              className="guild-card-avatar"
            />
          ) : (
            <div className="guild-card-avatar guild-card-avatar-fallback">
              <Server size={18} />
            </div>
          )}
          <CardTitle className="guild-card-name">{guild.name ?? guild.id}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Button className="hq-button w-full" onClick={onSelect}>
          Manage
        </Button>
      </CardContent>
    </Card>
  );
}

export function GuildSelector({ adminGuilds, isGlobalAdmin, onSelect }: GuildSelectorProps) {
  return (
    <section className="auth-panel guild-selector-panel">
      <Badge variant="outline" className="hq-badge">
        Server access
      </Badge>
      <h1 className="auth-title">Select a server</h1>
      <p className="auth-copy">
        Choose a Discord server where you have Administrator or Manage Server permissions.
      </p>

      <div className="guild-grid">
        {isGlobalAdmin && (
          <Card className="hq-card guild-card glow-border">
            <CardHeader className="space-y-2">
              <div className="guild-card-icon-row">
                <div className="guild-card-avatar guild-card-avatar-fallback gradient-text">
                  <Globe size={18} />
                </div>
                <CardTitle className="guild-card-name gradient-text">All Servers</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="hq-button w-full" onClick={() => onSelect(null)}>
                View all
              </Button>
            </CardContent>
          </Card>
        )}

        {adminGuilds.map((guild) => (
          <GuildCard key={guild.id} guild={guild} onSelect={() => onSelect(guild.id)} />
        ))}
      </div>

      {adminGuilds.length === 0 && !isGlobalAdmin && (
        <p className="auth-copy" style={{ marginTop: "1rem" }}>
          No servers found. You need Administrator or Manage Server permission in at least one
          Discord server.
        </p>
      )}
    </section>
  );
}
