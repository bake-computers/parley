export interface CommandOption {
  name: string;
  description: string;
  required: boolean;
  choices?: string[];
  autocomplete?: boolean;
}

export interface Subcommand {
  name: string;
  description: string;
  options?: CommandOption[];
}

export interface Command {
  name: string;
  description: string;
  subcommands?: Subcommand[];
  options?: CommandOption[];
}

export interface CommandCategory {
  title: string;
  description: string;
  commands: Command[];
}

export const accountCommandData: Command = {
  name: "account",
  description: "Register and inspect your Rainbow Six account",
  subcommands: [
    {
      name: "register",
      description: "Register your R6 account for this server",
      options: [
        {
          name: "username",
          description: "Exact in-game username",
          required: true,
        },
        {
          name: "platform",
          description: "Platform to register",
          required: false,
          choices: ["auto", "pc", "xbox", "playstation"],
        },
      ],
    },
    {
      name: "unregister",
      description: "Remove your registration from this server",
    },
    {
      name: "me",
      description: "Show your linked R6 account and this server status",
    },
    {
      name: "refresh",
      description: "Queue a fresh stats sync for your linked account",
    },
  ],
};

export const statsCommandData: Command = {
  name: "stats",
  description: "Show ranked Siege stats for a player",
  options: [
    {
      name: "username",
      description: "Exact in-game username",
      required: true,
    },
    {
      name: "platform",
      description: "Platform to look up",
      required: false,
      choices: ["auto", "pc", "xbox", "playstation"],
    },
    {
      name: "season",
      description: "Season name (for example: Deep Freeze)",
      required: false,
      autocomplete: true,
    },
  ],
};

export const teamCommandData: Command = {
  name: "team",
  description: "Build fair teams from ready registered players",
  subcommands: [
    {
      name: "create",
      description: "Build fair teams from ready registered players",
    },
  ],
};

export const queueCommandData: Command = {
  name: "queue",
  description: "Queue and manage cross-server 5v5 matchmaking",
  subcommands: [
    {
      name: "start",
      description: "Queue a full 5-stack for cross-server matchmaking",
    },
    {
      name: "status",
      description: "Show the active queue or cross-server match",
    },
    {
      name: "cancel",
      description: "Cancel the active queued 5-stack for this server",
    },
  ],
};

export const pingCommandData: Command = {
  name: "ping",
  description: "Check bot latency",
};

export const tournamentBrowseCommandData: Command = {
  name: "tournament",
  description: "Create and join public cross-server tournaments",
  subcommands: [
    {
      name: "create",
      description: "Create a public tournament listing",
      options: [
        {
          name: "name",
          description: "Tournament name",
          required: true,
        },
        {
          name: "format",
          description: "Bracket format",
          required: true,
          choices: ["single", "double"],
        },
        {
          name: "teams",
          description: "Total number of teams",
          required: true,
          choices: [4, 8, 16, 32].map(String),
        },
      ],
    },
    {
      name: "browse",
      description: "Browse public tournaments",
      options: [
        {
          name: "query",
          description: "Optional name search",
          required: false,
        },
        {
          name: "format",
          description: "Optional format filter",
          required: false,
          choices: ["single", "double"],
        },
        {
          name: "status",
          description: "Optional status filter",
          required: false,
          choices: ["open", "full_pending_start", "active"],
        },
      ],
    },
    {
      name: "view",
      description: "Show tournament status and bracket",
      options: [
        {
          name: "id",
          description: "Tournament ID",
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "join",
      description: "Join a tournament with a 5-player team",
      options: [
        {
          name: "id",
          description: "Tournament ID",
          required: true,
          autocomplete: true,
        },
        {
          name: "teamname",
          description: "Tournament team name",
          required: true,
        },
      ],
    },
    {
      name: "leave",
      description: "Leave a tournament before it starts",
      options: [
        {
          name: "id",
          description: "Tournament ID",
          required: true,
          autocomplete: true,
        },
      ],
    },
  ],
};

export const tournamentLifecycleCommandData: Command = {
  name: "tournament",
  description: "Create and join public cross-server tournaments",
  subcommands: [
    {
      name: "start",
      description: "Start a full tournament",
      options: [
        {
          name: "id",
          description: "Tournament ID",
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "cancel",
      description: "Cancel a tournament you created",
      options: [
        {
          name: "id",
          description: "Tournament ID",
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "forfeit",
      description: "Resolve a tournament match by forfeit",
      options: [
        {
          name: "id",
          description: "Tournament ID",
          required: true,
          autocomplete: true,
        },
        {
          name: "matchid",
          description: "Tournament bracket match ID",
          required: true,
        },
        {
          name: "winner",
          description: "Winning side",
          required: true,
          choices: ["A", "B"],
        },
      ],
    },
  ],
};

export const limitCommandData: Command = {
  name: "limit",
  description: "Manage the guild's recorded-match limit",
  subcommands: [
    {
      name: "set",
      description: "Set the number of recorded matches allowed per day",
      options: [
        {
          name: "matches",
          description: "Daily recorded match limit",
          required: true,
        },
      ],
    },
    {
      name: "clear",
      description: "Remove the guild-specific daily match limit",
    },
    {
      name: "show",
      description: "Show the current daily match limit",
    },
  ],
};

export const leaderboardCommandData: Command = {
  name: "leaderboard",
  description: "Show player rankings by internal ELO",
  options: [
    {
      name: "scope",
      description: "Leaderboard scope",
      required: false,
      choices: ["server", "global"],
    },
    {
      name: "platform",
      description: "Platform filter",
      required: false,
      choices: ["all", "pc", "xbox", "playstation"],
    },
    {
      name: "min_matches",
      description: "Minimum internal matches",
      required: false,
    },
  ],
};

export const helpCommandData: Command = {
  name: "help",
  description: "Browse Parley commands",
};

export const commandCategories: CommandCategory[] = [
  {
    title: "Account",
    description: "Link your R6 account and inspect your stats state.",
    commands: [accountCommandData, statsCommandData],
  },
  {
    title: "Teaming",
    description: "Build internal teams and manage cross-server queueing.",
    commands: [teamCommandData, queueCommandData, pingCommandData],
  },
  {
    title: "Tournaments I",
    description: "Create, browse, inspect, and join public tournaments.",
    commands: [tournamentBrowseCommandData],
  },
  {
    title: "Tournaments II / Admin",
    description: "Run brackets and manage tournament lifecycle actions.",
    commands: [tournamentLifecycleCommandData, limitCommandData],
  },
  {
    title: "Utility / Admin",
    description: "Server-wide limits and command discovery.",
    commands: [leaderboardCommandData, helpCommandData],
  },
];
