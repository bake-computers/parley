CREATE TABLE `custom_match_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`discord_user_id` text NOT NULL,
	`player_id` integer NOT NULL,
	`team` text NOT NULL,
	`slot` integer NOT NULL,
	`seed_rank_points` integer NOT NULL,
	`seed_kd_ratio` real NOT NULL,
	`seed_kost` real NOT NULL,
	`seed_kpr` real NOT NULL,
	`seed_headshot_percentage` real NOT NULL,
	`seed_score` real NOT NULL,
	`kills` integer,
	`deaths` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `custom_matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_match_players_match_user_unique` ON `custom_match_players` (`match_id`,`discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_match_players_match_team_slot_unique` ON `custom_match_players` (`match_id`,`team`,`slot`);--> statement-breakpoint
CREATE INDEX `custom_match_players_match_idx` ON `custom_match_players` (`match_id`);--> statement-breakpoint
CREATE TABLE `custom_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`created_by_discord_user_id` text NOT NULL,
	`status` text NOT NULL,
	`team_a_seed_total` real NOT NULL,
	`team_b_seed_total` real NOT NULL,
	`seed_gap` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `custom_matches_guild_created_idx` ON `custom_matches` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `custom_matches_status_idx` ON `custom_matches` (`status`);--> statement-breakpoint
CREATE TABLE `discord_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_user_id` text NOT NULL,
	`player_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_accounts_discord_user_id_unique` ON `discord_accounts` (`discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `discord_accounts_player_id_unique` ON `discord_accounts` (`player_id`);--> statement-breakpoint
CREATE TABLE `guild_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`daily_match_limit` integer NOT NULL,
	`updated_by_discord_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guild_limits_guild_id_unique` ON `guild_limits` (`guild_id`);--> statement-breakpoint
CREATE TABLE `guild_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`discord_user_id` text NOT NULL,
	`player_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guild_players_guild_user_unique` ON `guild_players` (`guild_id`,`discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guild_players_guild_player_unique` ON `guild_players` (`guild_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `guild_players_guild_idx` ON `guild_players` (`guild_id`);--> statement-breakpoint
CREATE INDEX `guild_players_player_idx` ON `guild_players` (`player_id`);