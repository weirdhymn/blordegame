CREATE TABLE IF NOT EXISTS "garden_plots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"crop" text,
	"fertilizer" text,
	"planted_at" timestamp with time zone,
	"last_watered_at" timestamp with time zone,
	"bonus_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "herds" ADD COLUMN "sprinkler_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "herds" ADD COLUMN "sprinkler_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "garden_plots" ADD CONSTRAINT "garden_plots_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "garden_plots_herd_slot_idx" ON "garden_plots" USING btree ("herd_id","slot");