CREATE TYPE "public"."battle_status" AS ENUM('active', 'won', 'retreated', 'fled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid NOT NULL,
	"run_id" uuid,
	"enemies" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"state" jsonb NOT NULL,
	"status" "battle_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "battles" ADD CONSTRAINT "battles_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "battles_herd_idx" ON "battles" USING btree ("herd_id");