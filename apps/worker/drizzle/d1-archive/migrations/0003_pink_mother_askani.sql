CREATE TABLE `matchmaking_queue_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`queue_id` integer NOT NULL,
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
	FOREIGN KEY (`queue_id`) REFERENCES `matchmaking_queues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matchmaking_queue_players_queue_user_unique` ON `matchmaking_queue_players` (`queue_id`,`discord_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matchmaking_queue_players_queue_slot_unique` ON `matchmaking_queue_players` (`queue_id`,`slot`);--> statement-breakpoint
CREATE INDEX `matchmaking_queue_players_queue_idx` ON `matchmaking_queue_players` (`queue_id`);--> statement-breakpoint
CREATE INDEX `matchmaking_queue_players_player_idx` ON `matchmaking_queue_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `matchmaking_queues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`captain_discord_user_id` text NOT NULL,
	`status` text NOT NULL,
	`player_count` integer NOT NULL,
	`stack_balance_total` real NOT NULL,
	`stack_balance_average` real NOT NULL,
	`matched_match_id` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`matched_match_id`) REFERENCES `custom_matches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `matchmaking_queues_guild_status_idx` ON `matchmaking_queues` (`guild_id`,`status`);--> statement-breakpoint
CREATE INDEX `matchmaking_queues_captain_status_idx` ON `matchmaking_queues` (`captain_discord_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `matchmaking_queues_status_created_idx` ON `matchmaking_queues` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `matchmaking_queues_expires_at_idx` ON `matchmaking_queues` (`expires_at`);--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `match_type` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `opponent_guild_id` text;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `opponent_channel_id` text;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `opponent_message_id` text;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `opponent_captain_discord_user_id` text;--> statement-breakpoint
CREATE INDEX `custom_matches_opponent_guild_created_idx` ON `custom_matches` (`opponent_guild_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `custom_matches_match_type_status_idx` ON `custom_matches` (`match_type`,`status`);