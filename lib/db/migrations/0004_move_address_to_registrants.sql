ALTER TABLE "registrants" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "registrants" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "registrant_identity" DROP COLUMN "address_line1";--> statement-breakpoint
ALTER TABLE "registrant_identity" DROP COLUMN "address_line2";