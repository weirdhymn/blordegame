CREATE TYPE "public"."glitch_kind" AS ENUM('inverted', 'screen', 'shade');--> statement-breakpoint
CREATE TYPE "public"."horse_origin" AS ENUM('founder', 'wild', 'bred');--> statement-breakpoint
CREATE TYPE "public"."life_stage" AS ENUM('foal', 'adult');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('player', 'mod', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "herds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cubes" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"sim_seed" integer NOT NULL,
	"last_sim_tick" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "herds_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "horse_ancestors" (
	"horse_id" uuid NOT NULL,
	"ancestor_id" uuid NOT NULL,
	CONSTRAINT "horse_ancestors_horse_id_ancestor_id_pk" PRIMARY KEY("horse_id","ancestor_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "horses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"herd_id" uuid,
	"genotype" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"glitch" "glitch_kind",
	"life_stage" "life_stage" DEFAULT 'foal' NOT NULL,
	"name" text,
	"parent_a" uuid,
	"parent_b" uuid,
	"origin" "horse_origin" NOT NULL,
	"born_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "herds" ADD CONSTRAINT "herds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horse_ancestors" ADD CONSTRAINT "horse_ancestors_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horse_ancestors" ADD CONSTRAINT "horse_ancestors_ancestor_id_horses_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horses" ADD CONSTRAINT "horses_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horses" ADD CONSTRAINT "horses_parent_a_horses_id_fk" FOREIGN KEY ("parent_a") REFERENCES "public"."horses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "horses" ADD CONSTRAINT "horses_parent_b_horses_id_fk" FOREIGN KEY ("parent_b") REFERENCES "public"."horses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horse_ancestors_ancestor_idx" ON "horse_ancestors" USING btree ("ancestor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horses_herd_idx" ON "horses" USING btree ("herd_id");