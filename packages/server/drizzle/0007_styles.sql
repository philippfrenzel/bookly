CREATE TABLE "book_styles" (
	"book_id" uuid PRIMARY KEY NOT NULL,
	"preset_keys" text[] NOT NULL,
	"team_style_ids" uuid[] NOT NULL,
	"addition" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_styles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "structure_proposals" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
ALTER TABLE "book_styles" ADD CONSTRAINT "book_styles_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_styles" ADD CONSTRAINT "team_styles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_proposals" ADD CONSTRAINT "structure_proposals_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;