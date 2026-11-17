-- Add catalog tables without resetting or altering existing account tables.
BEGIN;

-- CreateTable
CREATE TABLE "heroes" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "level" VARCHAR(3) NOT NULL,
    "attack" DECIMAL(12,4) NOT NULL,
    "health" DECIMAL(12,4) NOT NULL,
    "defense" DECIMAL(12,4) NOT NULL,
    "speed" DECIMAL(10,4) NOT NULL,
    "crit_rate" DECIMAL(10,4) NOT NULL,
    "crit_damage" DECIMAL(10,4) NOT NULL,
    "effect_hit" DECIMAL(10,4) NOT NULL,
    "effect_resistance" DECIMAL(10,4) NOT NULL,
    "lowest_rank" VARCHAR(255) NOT NULL,
    "is_collaboration" BOOLEAN NOT NULL,
    "additional_attributes" VARCHAR(255),
    "additional_attributes_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heroes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relic_suits" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "two_piece_attribute" VARCHAR(128) NOT NULL,
    "two_piece_effect" TEXT NOT NULL,
    "is_oma" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relic_suits_pkey" PRIMARY KEY ("id")
);

-- This table already exists on installations with the historical official-config migration.
-- Its columns and primary key were verified before adopting it; retain its existing row.
CREATE TABLE IF NOT EXISTS "cbg_game_auto_config" (
    "game_id" VARCHAR(32) NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cbg_game_auto_config_pkey" PRIMARY KEY ("game_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "heroes_slug_key" ON "heroes"("slug");

-- CreateIndex
CREATE INDEX "heroes_level_idx" ON "heroes"("level");

-- CreateIndex
CREATE UNIQUE INDEX "relic_suits_slug_key" ON "relic_suits"("slug");

-- CreateIndex
CREATE INDEX "relic_suits_is_oma_idx" ON "relic_suits"("is_oma");

COMMIT;
