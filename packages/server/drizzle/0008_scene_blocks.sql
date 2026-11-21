CREATE TABLE "scene_assignment_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "target_words_min" integer;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "target_words_max" integer;--> statement-breakpoint
ALTER TABLE "scene_assignments" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_assignment_blocks" ADD CONSTRAINT "scene_assignment_blocks_assignment_id_scene_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."scene_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scene_assignment_blocks_position" ON "scene_assignment_blocks" USING btree ("assignment_id","position");--> statement-breakpoint
INSERT INTO "scene_assignment_blocks" ("assignment_id", "position", "text") SELECT "id", 0, "description" FROM "scene_assignments";
