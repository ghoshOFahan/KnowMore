CREATE TABLE "knowmore"."pair_results" (
	"game_id" integer NOT NULL,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"sync_result" text NOT NULL,
	"read_a" boolean,
	"read_b" boolean,
	"overlap" real,
	"played_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pair_results_game_id_user_a_user_b_pk" PRIMARY KEY("game_id","user_a","user_b")
);
--> statement-breakpoint
CREATE TABLE "knowmore"."safety_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowmore"."safety_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reporter_id" text NOT NULL,
	"reported_id" text NOT NULL,
	"room_id" varchar(10) NOT NULL,
	"category" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowmore"."user_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD COLUMN IF NOT EXISTS "word_trail" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD COLUMN IF NOT EXISTS "anchor_scores" jsonb;--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD COLUMN "off_map_scores" jsonb;--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD COLUMN "analysis_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD COLUMN "game_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowmore"."pair_results" ADD CONSTRAINT "pair_results_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "knowmore"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."pair_results" ADD CONSTRAINT "pair_results_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."pair_results" ADD CONSTRAINT "pair_results_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."safety_reports" ADD CONSTRAINT "safety_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."safety_reports" ADD CONSTRAINT "safety_reports_reported_id_users_id_fk" FOREIGN KEY ("reported_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;
