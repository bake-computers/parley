CREATE TABLE `tournament_bracket_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`bracket` text NOT NULL,
	`round_number` integer NOT NULL,
	`match_number` integer NOT NULL,
	`status` text NOT NULL,
	`entry_a_id` integer,
	`entry_b_id` integer,
	`winner_entry_id` integer,
	`loser_entry_id` integer,
	`winner_to_match_id` integer,
	`winner_to_slot` text,
	`loser_to_match_id` integer,
	`loser_to_slot` text,
	`custom_match_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_a_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entry_b_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`winner_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`loser_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`custom_match_id`) REFERENCES `custom_matches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_bracket_matches_round_match_unique` ON `tournament_bracket_matches` (`tournament_id`,`bracket`,`round_number`,`match_number`);--> statement-breakpoint
CREATE INDEX `tournament_bracket_matches_tournament_idx` ON `tournament_bracket_matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_bracket_matches_tournament_status_idx` ON `tournament_bracket_matches` (`tournament_id`,`status`);--> statement-breakpoint
CREATE INDEX `tournament_bracket_matches_custom_match_idx` ON `tournament_bracket_matches` (`custom_match_id`);--> statement-breakpoint
CREATE TABLE `tournament_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`captain_discord_user_id` text NOT NULL,
	`team_name` text NOT NULL,
	`team_name_normalized` text NOT NULL,
	`status` text NOT NULL,
	`seed_number` integer,
	`stack_balance_total` real NOT NULL,
	`stack_balance_average` real NOT NULL,
	`joined_at` integer NOT NULL,
	`eliminated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entries_tournament_captain_unique` ON `tournament_entries` (`tournament_id`,`captain_discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entries_tournament_team_name_unique` ON `tournament_entries` (`tournament_id`,`team_name_normalized`);--> statement-breakpoint
CREATE INDEX `tournament_entries_tournament_idx` ON `tournament_entries` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_entries_tournament_status_idx` ON `tournament_entries` (`tournament_id`,`status`);--> statement-breakpoint
CREATE INDEX `tournament_entries_guild_idx` ON `tournament_entries` (`guild_id`);--> statement-breakpoint
CREATE TABLE `tournament_entry_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`discord_user_id` text NOT NULL,
	`player_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`username` text NOT NULL,
	`platform` text NOT NULL,
	`balance_rating` real NOT NULL,
	`seed_rank_points` integer NOT NULL,
	`seed_kd_ratio` real NOT NULL,
	`seed_kost` real NOT NULL,
	`seed_kpr` real NOT NULL,
	`seed_headshot_percentage` real NOT NULL,
	`seed_score` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entry_players_entry_slot_unique` ON `tournament_entry_players` (`entry_id`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entry_players_entry_user_unique` ON `tournament_entry_players` (`entry_id`,`discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entry_players_tournament_user_unique` ON `tournament_entry_players` (`tournament_id`,`discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entry_players_tournament_player_unique` ON `tournament_entry_players` (`tournament_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `tournament_entry_players_tournament_idx` ON `tournament_entry_players` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_entry_players_entry_idx` ON `tournament_entry_players` (`entry_id`);--> statement-breakpoint
CREATE INDEX `tournament_entry_players_player_idx` ON `tournament_entry_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`format` text NOT NULL,
	`team_cap` integer NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text NOT NULL,
	`created_by_guild_id` text NOT NULL,
	`created_by_channel_id` text NOT NULL,
	`created_by_discord_user_id` text NOT NULL,
	`hub_message_id` text,
	`filled_at` integer,
	`auto_start_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`winner_entry_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tournaments_name_lookup_idx` ON `tournaments` (`name_normalized`);--> statement-breakpoint
CREATE INDEX `tournaments_status_idx` ON `tournaments` (`status`);--> statement-breakpoint
CREATE INDEX `tournaments_visibility_status_idx` ON `tournaments` (`visibility`,`status`);--> statement-breakpoint
CREATE INDEX `tournaments_auto_start_idx` ON `tournaments` (`status`,`auto_start_at`);--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `resolution_type` text DEFAULT 'played' NOT NULL;