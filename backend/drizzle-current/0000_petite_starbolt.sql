CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
--> statement-breakpoint
CREATE SCHEMA "knowmore";
--> statement-breakpoint
CREATE TABLE "knowmore"."accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowmore"."game_players" (
	"game_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"is_eliminated" boolean DEFAULT false,
	"words_contributed" integer DEFAULT 0,
	"rank" integer,
	CONSTRAINT "game_players_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "knowmore"."games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowmore"."games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"room_id" varchar(10) NOT NULL,
	"winner_id" text,
	"word_chain" text[] DEFAULT '{}' NOT NULL,
	"played_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowmore"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "knowmore"."topic_anchors" (
	"user_id" text NOT NULL,
	"topic_id" integer NOT NULL,
	"current_score" real,
	CONSTRAINT "topic_anchors_user_id_topic_id_pk" PRIMARY KEY("user_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "knowmore"."topics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowmore"."topics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"embedding_vector" vector(768) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "topics_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "knowmore"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "knowmore"."verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowmore"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "knowmore"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."game_players" ADD CONSTRAINT "game_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."games" ADD CONSTRAINT "games_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "knowmore"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."topic_anchors" ADD CONSTRAINT "topic_anchors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "knowmore"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowmore"."topic_anchors" ADD CONSTRAINT "topic_anchors_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "knowmore"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "knowmore"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "knowmore"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "knowmore"."verifications" USING btree ("identifier");