CREATE TABLE "access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"child_id" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "registrant_identity" (
	"child_id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"middle_initial" text,
	"address_line1" text,
	"address_line2" text,
	"zipcode_plus4" text
);
--> statement-breakpoint
CREATE TABLE "registrants" (
	"child_id" text PRIMARY KEY NOT NULL,
	"program_partner" text,
	"lpp_group" text,
	"registration_type" text,
	"registration_date" date,
	"welcome_book" boolean,
	"graduated" boolean,
	"age_group" text,
	"months_registered" integer,
	"projected_graduation" date,
	"months_to_graduation" integer,
	"book_language" text,
	"city" text,
	"county" text,
	"state" text,
	"zipcode" text,
	"latitude" double precision,
	"longitude" double precision,
	"geocode_accuracy" numeric,
	"geocode_accuracy_type" text,
	"address_changed_at" date,
	"geocode_stale" boolean,
	"block_group_geoid" text
);
--> statement-breakpoint
ALTER TABLE "registrant_identity" ADD CONSTRAINT "registrant_identity_child_id_registrants_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."registrants"("child_id") ON DELETE no action ON UPDATE no action;