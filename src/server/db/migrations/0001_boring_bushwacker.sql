CREATE TYPE "public"."owner_type" AS ENUM('user', 'organization');--> statement-breakpoint
CREATE TABLE "weeek_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"weeek_workspace_id" text,
	"name" text NOT NULL,
	"master_key_ciphertext" "bytea" NOT NULL,
	"master_key_iv" "bytea" NOT NULL,
	"master_key_tag" "bytea" NOT NULL,
	"master_key_last4" text NOT NULL,
	"master_key_fingerprint" "bytea" NOT NULL,
	"enc_version" integer DEFAULT 1 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "weeek_workspace_owner_idx" ON "weeek_workspace" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weeek_workspace_owner_fingerprint_uq" ON "weeek_workspace" USING btree ("owner_type","owner_id","master_key_fingerprint");