CREATE TYPE "public"."listing_status" AS ENUM('active', 'sold', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_herd" uuid NOT NULL,
	"to_herd" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_herd" uuid NOT NULL,
	"to_herd" uuid NOT NULL,
	"offer_horses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offer_cubes" integer DEFAULT 0 NOT NULL,
	"request_horses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_cubes" integer DEFAULT 0 NOT NULL,
	"status" "trade_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_from_herd_herds_id_fk" FOREIGN KEY ("from_herd") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_to_herd_herds_id_fk" FOREIGN KEY ("to_herd") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_from_herd_herds_id_fk" FOREIGN KEY ("from_herd") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_to_herd_herds_id_fk" FOREIGN KEY ("to_herd") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_herd_idx" ON "audit_log" USING btree ("herd_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_status_idx" ON "market_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_to_idx" ON "messages" USING btree ("to_herd");