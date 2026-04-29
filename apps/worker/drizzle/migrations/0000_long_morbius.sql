CREATE TABLE "custom_match_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"discord_user_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"team" text NOT NULL,
	"slot" integer NOT NULL,
	"seed_rank_points" integer NOT NULL,
	"seed_kd_ratio" double precision NOT NULL,
	"seed_kost" double precision NOT NULL,
	"seed_kpr" double precision NOT NULL,
	"seed_headshot_percentage" double precision NOT NULL,
	"seed_score" double precision NOT NULL,
	"balance_rating" double precision DEFAULT 0 NOT NULL,
	"kills" integer,
	"deaths" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"created_by_discord_user_id" text NOT NULL,
	"status" text NOT NULL,
	"match_type" text DEFAULT 'internal' NOT NULL,
	"opponent_guild_id" text,
	"opponent_channel_id" text,
	"opponent_message_id" text,
	"opponent_captain_discord_user_id" text,
	"team_a_seed_total" double precision NOT NULL,
	"team_b_seed_total" double precision NOT NULL,
	"seed_gap" double precision NOT NULL,
	"winning_team" text,
	"resolution_type" text DEFAULT 'played' NOT NULL,
	"team_a_balance_total" double precision DEFAULT 0 NOT NULL,
	"team_b_balance_total" double precision DEFAULT 0 NOT NULL,
	"balance_gap" double precision DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_user_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"daily_match_limit" integer NOT NULL,
	"updated_by_discord_user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchmaking_queue_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"queue_id" integer NOT NULL,
	"discord_user_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"username" text NOT NULL,
	"platform" text NOT NULL,
	"balance_rating" double precision NOT NULL,
	"seed_rank_points" integer NOT NULL,
	"seed_kd_ratio" double precision NOT NULL,
	"seed_kost" double precision NOT NULL,
	"seed_kpr" double precision NOT NULL,
	"seed_headshot_percentage" double precision NOT NULL,
	"seed_score" double precision NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchmaking_queues" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"captain_discord_user_id" text NOT NULL,
	"status" text NOT NULL,
	"player_count" integer NOT NULL,
	"stack_balance_total" double precision NOT NULL,
	"stack_balance_average" double precision NOT NULL,
	"matched_match_id" integer,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"platform" text NOT NULL,
	"profile_url" text,
	"level" integer DEFAULT 0 NOT NULL,
	"internal_elo" double precision DEFAULT 1000 NOT NULL,
	"internal_matches" integer DEFAULT 0 NOT NULL,
	"internal_wins" integer DEFAULT 0 NOT NULL,
	"internal_losses" integer DEFAULT 0 NOT NULL,
	"internal_updated_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stat_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"fetched_at" bigint NOT NULL,
	"source" text NOT NULL,
	"cache_version" integer NOT NULL,
	"current_rank" text,
	"rank_points" integer DEFAULT 0 NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"headshots" integer DEFAULT 0 NOT NULL,
	"kd_ratio" double precision DEFAULT 0 NOT NULL,
	"headshot_percentage" double precision DEFAULT 0 NOT NULL,
	"win_rate" double precision DEFAULT 0 NOT NULL,
	"kost" double precision DEFAULT 0 NOT NULL,
	"payload_json" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_bracket_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"bracket" text NOT NULL,
	"round_number" integer NOT NULL,
	"match_number" integer NOT NULL,
	"status" text NOT NULL,
	"entry_a_id" integer,
	"entry_b_id" integer,
	"winner_entry_id" integer,
	"loser_entry_id" integer,
	"winner_to_match_id" integer,
	"winner_to_slot" text,
	"loser_to_match_id" integer,
	"loser_to_slot" text,
	"custom_match_id" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"captain_discord_user_id" text NOT NULL,
	"team_name" text NOT NULL,
	"team_name_normalized" text NOT NULL,
	"status" text NOT NULL,
	"seed_number" integer,
	"stack_balance_total" double precision NOT NULL,
	"stack_balance_average" double precision NOT NULL,
	"joined_at" bigint NOT NULL,
	"eliminated_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_entry_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"discord_user_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"username" text NOT NULL,
	"platform" text NOT NULL,
	"balance_rating" double precision NOT NULL,
	"seed_rank_points" integer NOT NULL,
	"seed_kd_ratio" double precision NOT NULL,
	"seed_kost" double precision NOT NULL,
	"seed_kpr" double precision NOT NULL,
	"seed_headshot_percentage" double precision NOT NULL,
	"seed_score" double precision NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"format" text NOT NULL,
	"team_cap" integer NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"status" text NOT NULL,
	"created_by_guild_id" text NOT NULL,
	"created_by_channel_id" text NOT NULL,
	"created_by_discord_user_id" text NOT NULL,
	"hub_message_id" text,
	"filled_at" bigint,
	"auto_start_at" bigint,
	"started_at" bigint,
	"completed_at" bigint,
	"winner_entry_id" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_match_players" ADD CONSTRAINT "custom_match_players_match_id_custom_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."custom_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_match_players" ADD CONSTRAINT "custom_match_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_accounts" ADD CONSTRAINT "discord_accounts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_players" ADD CONSTRAINT "guild_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue_players" ADD CONSTRAINT "matchmaking_queue_players_queue_id_matchmaking_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."matchmaking_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue_players" ADD CONSTRAINT "matchmaking_queue_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queues" ADD CONSTRAINT "matchmaking_queues_matched_match_id_custom_matches_id_fk" FOREIGN KEY ("matched_match_id") REFERENCES "public"."custom_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_snapshots" ADD CONSTRAINT "stat_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_entry_a_id_tournament_entries_id_fk" FOREIGN KEY ("entry_a_id") REFERENCES "public"."tournament_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_entry_b_id_tournament_entries_id_fk" FOREIGN KEY ("entry_b_id") REFERENCES "public"."tournament_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_winner_entry_id_tournament_entries_id_fk" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_loser_entry_id_tournament_entries_id_fk" FOREIGN KEY ("loser_entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_custom_match_id_custom_matches_id_fk" FOREIGN KEY ("custom_match_id") REFERENCES "public"."custom_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_entry_id_tournament_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_match_players_match_user_unique" ON "custom_match_players" USING btree ("match_id","discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_match_players_match_team_slot_unique" ON "custom_match_players" USING btree ("match_id","team","slot");--> statement-breakpoint
CREATE INDEX "custom_match_players_match_idx" ON "custom_match_players" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "custom_matches_guild_created_idx" ON "custom_matches" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "custom_matches_opponent_guild_created_idx" ON "custom_matches" USING btree ("opponent_guild_id","created_at");--> statement-breakpoint
CREATE INDEX "custom_matches_status_idx" ON "custom_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custom_matches_match_type_status_idx" ON "custom_matches" USING btree ("match_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_accounts_discord_user_id_unique" ON "discord_accounts" USING btree ("discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_accounts_player_id_unique" ON "discord_accounts" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_limits_guild_id_unique" ON "guild_limits" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_players_guild_user_unique" ON "guild_players" USING btree ("guild_id","discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_players_guild_player_unique" ON "guild_players" USING btree ("guild_id","player_id");--> statement-breakpoint
CREATE INDEX "guild_players_guild_idx" ON "guild_players" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "guild_players_player_idx" ON "guild_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "guild_players_discord_user_idx" ON "guild_players" USING btree ("discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matchmaking_queue_players_queue_user_unique" ON "matchmaking_queue_players" USING btree ("queue_id","discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matchmaking_queue_players_queue_slot_unique" ON "matchmaking_queue_players" USING btree ("queue_id","slot");--> statement-breakpoint
CREATE INDEX "matchmaking_queue_players_queue_idx" ON "matchmaking_queue_players" USING btree ("queue_id");--> statement-breakpoint
CREATE INDEX "matchmaking_queue_players_player_idx" ON "matchmaking_queue_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matchmaking_queues_guild_status_idx" ON "matchmaking_queues" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "matchmaking_queues_captain_status_idx" ON "matchmaking_queues" USING btree ("captain_discord_user_id","status");--> statement-breakpoint
CREATE INDEX "matchmaking_queues_status_created_idx" ON "matchmaking_queues" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "matchmaking_queues_expires_at_idx" ON "matchmaking_queues" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_profile_id_unique" ON "players" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_username_platform_unique" ON "players" USING btree ("username_normalized","platform");--> statement-breakpoint
CREATE INDEX "players_username_lookup_idx" ON "players" USING btree ("username_normalized");--> statement-breakpoint
CREATE INDEX "stat_snapshots_player_idx" ON "stat_snapshots" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "stat_snapshots_player_fetched_idx" ON "stat_snapshots" USING btree ("player_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_bracket_matches_round_match_unique" ON "tournament_bracket_matches" USING btree ("tournament_id","bracket","round_number","match_number");--> statement-breakpoint
CREATE INDEX "tournament_bracket_matches_tournament_idx" ON "tournament_bracket_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_bracket_matches_tournament_status_idx" ON "tournament_bracket_matches" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE INDEX "tournament_bracket_matches_custom_match_idx" ON "tournament_bracket_matches" USING btree ("custom_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entries_tournament_captain_unique" ON "tournament_entries" USING btree ("tournament_id","captain_discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entries_tournament_team_name_unique" ON "tournament_entries" USING btree ("tournament_id","team_name_normalized");--> statement-breakpoint
CREATE INDEX "tournament_entries_tournament_idx" ON "tournament_entries" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_entries_tournament_status_idx" ON "tournament_entries" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE INDEX "tournament_entries_guild_idx" ON "tournament_entries" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entry_players_entry_slot_unique" ON "tournament_entry_players" USING btree ("entry_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entry_players_entry_user_unique" ON "tournament_entry_players" USING btree ("entry_id","discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entry_players_tournament_user_unique" ON "tournament_entry_players" USING btree ("tournament_id","discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entry_players_tournament_player_unique" ON "tournament_entry_players" USING btree ("tournament_id","player_id");--> statement-breakpoint
CREATE INDEX "tournament_entry_players_tournament_idx" ON "tournament_entry_players" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_entry_players_entry_idx" ON "tournament_entry_players" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "tournament_entry_players_player_idx" ON "tournament_entry_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "tournaments_name_lookup_idx" ON "tournaments" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX "tournaments_status_idx" ON "tournaments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tournaments_visibility_status_idx" ON "tournaments" USING btree ("visibility","status");--> statement-breakpoint
CREATE INDEX "tournaments_auto_start_idx" ON "tournaments" USING btree ("status","auto_start_at");