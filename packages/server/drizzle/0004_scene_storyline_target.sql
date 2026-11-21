ALTER TABLE "scene_assignments" ALTER COLUMN "section_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_assignments" ADD COLUMN "storyline_id" uuid;--> statement-breakpoint
ALTER TABLE "scene_assignments" ADD CONSTRAINT "scene_assignments_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scene_assignments_storyline_unique" ON "scene_assignments" USING btree ("scene_id","storyline_id");--> statement-breakpoint
ALTER TABLE "scene_assignments" ADD CONSTRAINT "scene_assignments_one_target" CHECK (("scene_assignments"."section_id" IS NULL) <> ("scene_assignments"."storyline_id" IS NULL));