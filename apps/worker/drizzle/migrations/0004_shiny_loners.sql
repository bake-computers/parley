CREATE TABLE "auto_tournament_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"team_cap" integer NOT NULL,
	"cron_expression" text NOT NULL,
	"channel_id" text NOT NULL,
	"role_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_match_rules" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"min_elo" integer,
	"max_elo" integer,
	"platforms" text[],
	"require_verified" boolean DEFAULT false NOT NULL,
	"max_elo_gap" integer DEFAULT 500 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_notification_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"match_results_channel" text,
	"tournament_announcements_channel" text,
	"leaderboard_updates_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"default_team_format" text,
	"auto_balance" boolean DEFAULT true NOT NULL,
	"cross_guild_matchmaking" boolean DEFAULT true NOT NULL,
	"updated_at" bigint NOT NULL,
	"updated_by_discord_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auto_tournament_schedules_guild_enabled_idx" ON "auto_tournament_schedules" USING btree ("guild_id","enabled");