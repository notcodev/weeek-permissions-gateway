CREATE TABLE "verb_preset" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"verbs" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verb_preset_owner_idx" ON "verb_preset" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verb_preset_owner_name_uq" ON "verb_preset" USING btree ("owner_type","owner_id","name");