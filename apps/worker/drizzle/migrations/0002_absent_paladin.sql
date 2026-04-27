ALTER TABLE `custom_match_players` ADD `balance_rating` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `winning_team` text;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `team_a_balance_total` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `team_b_balance_total` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_matches` ADD `balance_gap` real DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `custom_match_players` SET `balance_rating` = `seed_score`;--> statement-breakpoint
UPDATE `custom_matches`
SET
  `team_a_balance_total` = `team_a_seed_total`,
  `team_b_balance_total` = `team_b_seed_total`,
  `balance_gap` = `seed_gap`;--> statement-breakpoint
ALTER TABLE `players` ADD `internal_elo` real DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `internal_matches` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `internal_wins` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `internal_losses` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `internal_updated_at` integer;
