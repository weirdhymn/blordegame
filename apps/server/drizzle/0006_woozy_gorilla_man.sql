ALTER TABLE "horses" ADD COLUMN "tavern_fee" integer;--> statement-breakpoint
ALTER TABLE "horses" ADD COLUMN "first_encountered_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horses" ADD CONSTRAINT "horses_first_encountered_by_herds_id_fk" FOREIGN KEY ("first_encountered_by") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
