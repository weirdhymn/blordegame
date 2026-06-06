CREATE TYPE "public"."adventure_run_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adventure_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"party" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"scene_id" text NOT NULL,
	"loot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cubes" integer DEFAULT 0 NOT NULL,
	"fatigue" integer DEFAULT 0 NOT NULL,
	"befriended" text,
	"status" "adventure_run_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adventure_runs" ADD CONSTRAINT "adventure_runs_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adventure_runs_herd_idx" ON "adventure_runs" USING btree ("herd_id");