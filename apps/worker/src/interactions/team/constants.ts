export const TEAM_COMMAND_NAME = "team";
export const TEAM_COMMAND_DESCRIPTION = "Assemble balanced custom teams and track the match";

// Component custom_ids. All share the "team" prefix; ComponentHandler routes
// on the first path segment and the handlers below disambiguate on the rest.
export const TEAM_USER_SELECT = "team/select";
export const TEAM_ROUND_LOG_PREFIX = "team/round-log"; // team/round-log/<matchId>/<a|b>
export const TEAM_END_PREFIX = "team/end"; // team/end/<matchId>
export const TEAM_WINNER_PREFIX = "team/winner"; // team/winner/<matchId>/<a|b>

// Modal custom_id prefix: team-round-modal/<matchId>/<a|b>
export const TEAM_ROUND_MODAL_PREFIX = "team-round-modal";
// TextInput custom_ids inside the round modal: team-round-input-<slot>
export const TEAM_ROUND_INPUT_PREFIX = "team-round-input";

export const TEAM_MIN_PLAYERS = 2;
export const TEAM_MAX_PLAYERS = 10;
// Discord modals hold at most 5 input rows, which lines up with the 5v5 cap.
export const TEAM_MAX_PER_TEAM = 5;

export type TeamSide = "a" | "b";

export function isTeamSide(value: string | undefined): value is TeamSide {
  return value === "a" || value === "b";
}
