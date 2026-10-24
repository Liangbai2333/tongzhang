-- Existing single-token sessions cannot be upgraded; require a fresh login.
UPDATE auth_sessions SET revoked_at = now() WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE "auth_refresh_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_auth_refresh_tokens_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_auth_refresh_tokens_consumed" CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP CONSTRAINT "uq_auth_sessions_token_hash";--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP CONSTRAINT "ck_auth_sessions_hash";--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_auth_refresh_tokens_session" ON "auth_refresh_tokens" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "token_hash";