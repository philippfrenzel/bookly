ALTER TABLE "books" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "books" SET "updated_at" = "created_at";