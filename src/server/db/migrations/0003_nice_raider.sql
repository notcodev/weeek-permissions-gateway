CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_key_id" text,
	"request_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"query" text,
	"our_status" integer NOT NULL,
	"upstream_status" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"verb" text,
	"deny_reason" text,
	"ip_hash" "bytea",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_weeek_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."weeek_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_sub_key_id_sub_key_id_fk" FOREIGN KEY ("sub_key_id") REFERENCES "public"."sub_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_workspace_time_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_sub_key_time_idx" ON "audit_log" USING btree ("sub_key_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_deny_idx" ON "audit_log" USING btree ("workspace_id","deny_reason");