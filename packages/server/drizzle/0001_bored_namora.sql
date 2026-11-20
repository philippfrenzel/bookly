CREATE TABLE "character_checks" (
	"storyline_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"input_hash" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "character_warning_acks" (
	"storyline_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"criterion" text NOT NULL,
	CONSTRAINT "character_warning_acks_storyline_id_character_id_criterion_pk" PRIMARY KEY("storyline_id","character_id","criterion")
);
--> statement-breakpoint
CREATE TABLE "character_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storyline_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"criterion" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "behavior" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "intentions" text;--> statement-breakpoint
ALTER TABLE "storyline_characters" ADD COLUMN "behavior" text;--> statement-breakpoint
ALTER TABLE "storyline_characters" ADD COLUMN "intentions" text;--> statement-breakpoint
ALTER TABLE "character_checks" ADD CONSTRAINT "character_checks_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_warning_acks" ADD CONSTRAINT "character_warning_acks_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_warning_acks" ADD CONSTRAINT "character_warning_acks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_warnings" ADD CONSTRAINT "character_warnings_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_warnings" ADD CONSTRAINT "character_warnings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;