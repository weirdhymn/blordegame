CREATE TYPE "public"."quest_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory" (
	"herd_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_herd_id_item_id_pk" PRIMARY KEY("herd_id","item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quest_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"status" "quest_status" DEFAULT 'active' NOT NULL,
	"counters" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory" ADD CONSTRAINT "inventory_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quest_progress_herd_quest_idx" ON "quest_progress" USING btree ("herd_id","quest_id");