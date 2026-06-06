CREATE TABLE IF NOT EXISTS "field_guide" (
	"herd_id" uuid NOT NULL,
	"color_slug" text NOT NULL,
	"name" text NOT NULL,
	"first_horse_id" uuid,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_guide_herd_id_color_slug_pk" PRIMARY KEY("herd_id","color_slug")
);
--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "care_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "last_cared_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_guide" ADD CONSTRAINT "field_guide_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_guide" ADD CONSTRAINT "field_guide_first_horse_id_horses_id_fk" FOREIGN KEY ("first_horse_id") REFERENCES "public"."horses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
