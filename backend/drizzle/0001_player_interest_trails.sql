ALTER TABLE "knowmore"."game_players"
  ADD COLUMN IF NOT EXISTS "word_trail" text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE "knowmore"."game_players"
  ADD COLUMN IF NOT EXISTS "anchor_scores" jsonb;
