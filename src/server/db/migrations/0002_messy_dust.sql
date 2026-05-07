CREATE TYPE "public"."sub_key_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "sub_key" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"label" text NOT NULL,
	"prefix" text DEFAULT 'wgw_' NOT NULL,
	"hash" "bytea" NOT NULL,
	"last4" text NOT NULL,
	"status" "sub_key_status" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"bound_weeek_user_id" text,
	"bound_weeek_user_name" text,
	"visibility_bound" boolean DEFAULT false NOT NULL,
	"author_rewrite" boolean DEFAULT false NOT NULL,
	"scope_projects" text[] NOT NULL,
	"scope_boards" text[] NOT NULL,
	"verbs" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sub_key" ADD CONSTRAINT "sub_key_workspace_id_weeek_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."weeek_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_key" ADD CONSTRAINT "sub_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_key" ADD CONSTRAINT "sub_key_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sub_key_hash_uq" ON "sub_key" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "sub_key_workspace_idx" ON "sub_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sub_key_workspace_status_idx" ON "sub_key" USING btree ("workspace_id","status");