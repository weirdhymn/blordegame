CREATE TABLE IF NOT EXISTS "job_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"horse_id" uuid NOT NULL,
	"herd_id" uuid NOT NULL,
	"structure_type" text NOT NULL,
	"skill" text NOT NULL,
	"stat" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_assignments_horse_id_unique" UNIQUE("horse_id")
);
--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "stats" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "luck" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "skills" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "accomplishments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_assignments_herd_idx" ON "job_assignments" USING btree ("herd_id");