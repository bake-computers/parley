CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text,
	`username` text NOT NULL,
	`username_normalized` text NOT NULL,
	`platform` text NOT NULL,
	`profile_url` text,
	`level` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_profile_id_unique` ON `players` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_username_platform_unique` ON `players` (`username_normalized`,`platform`);--> statement-breakpoint
CREATE INDEX `players_username_lookup_idx` ON `players` (`username_normalized`);--> statement-breakpoint
CREATE TABLE `stat_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`source` text NOT NULL,
	`cache_version` integer NOT NULL,
	`current_rank` text,
	`rank_points` integer DEFAULT 0 NOT NULL,
	`matches` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`kills` integer DEFAULT 0 NOT NULL,
	`deaths` integer DEFAULT 0 NOT NULL,
	`assists` integer DEFAULT 0 NOT NULL,
	`headshots` integer DEFAULT 0 NOT NULL,
	`kd_ratio` real DEFAULT 0 NOT NULL,
	`headshot_percentage` real DEFAULT 0 NOT NULL,
	`win_rate` real DEFAULT 0 NOT NULL,
	`kost` real DEFAULT 0 NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stat_snapshots_player_idx` ON `stat_snapshots` (`player_id`);--> statement-breakpoint
CREATE INDEX `stat_snapshots_player_fetched_idx` ON `stat_snapshots` (`player_id`,`fetched_at`);