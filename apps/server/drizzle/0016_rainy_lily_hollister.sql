ALTER TABLE "herds" ADD COLUMN "meal_day" integer;--> statement-breakpoint
ALTER TABLE "herds" ADD COLUMN "meal_buffs" jsonb;--> statement-breakpoint
ALTER TABLE "herds" ADD COLUMN "groom_bonus_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "mood" text DEFAULT 'content' NOT NULL;