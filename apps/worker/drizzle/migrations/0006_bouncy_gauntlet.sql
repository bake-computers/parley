ALTER TABLE "guild_players" ADD COLUMN "internal_elo" double precision DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_players" ADD COLUMN "internal_matches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_players" ADD COLUMN "internal_wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_players" ADD COLUMN "internal_losses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_players" ADD COLUMN "internal_updated_at" bigint;