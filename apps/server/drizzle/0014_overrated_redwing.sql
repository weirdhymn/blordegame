CREATE TYPE "public"."horse_class" AS ENUM('knight', 'wizard', 'rogue', 'cleric');--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "class" "horse_class";