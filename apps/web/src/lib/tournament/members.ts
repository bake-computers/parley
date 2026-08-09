import { discordAvatarUrl } from "../discord/oauth.js";

export type LinkedGuildMember = {
  discordUserId: string;
  username: string;
};

export type DiscordGuildMember = {
  id: string;
  name: string;
  avatarUrl: string;
};

export type TournamentPickerMember = {
  id: string;
  name: string;
  avatarUrl: string;
};

/** Discord display name with R6 username in parentheses when they differ. */
export function formatTournamentMemberName(discordName: string, gameUsername: string): string {
  const discord = discordName.trim();
  const game = gameUsername.trim();
  if (!discord) {
    return game;
  }
  if (!game || discord.toLowerCase() === game.toLowerCase()) {
    return discord;
  }
  return `${discord} (${game})`;
}

/**
 * Eligible roster = linked engine members only. Discord guild data supplies
 * avatar + display name; R6 username stays available for disambiguation.
 */
export function mergeTournamentMembers(
  linked: LinkedGuildMember[],
  discordMembers: DiscordGuildMember[],
): TournamentPickerMember[] {
  const byId = new Map(discordMembers.map((member) => [member.id, member]));
  return linked
    .map((member) => {
      const discord = byId.get(member.discordUserId);
      const gameUsername = member.username.trim();
      if (discord) {
        return {
          id: member.discordUserId,
          name: formatTournamentMemberName(discord.name, gameUsername),
          avatarUrl: discord.avatarUrl,
        };
      }
      return {
        id: member.discordUserId,
        name: gameUsername || member.discordUserId,
        avatarUrl: discordAvatarUrl(member.discordUserId, null),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
