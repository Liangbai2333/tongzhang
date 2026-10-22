CREATE TABLE "auth_sessions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_auth_sessions" PRIMARY KEY("id"),
	CONSTRAINT "uq_auth_sessions_token_hash" UNIQUE("token_hash"),
	CONSTRAINT "ck_auth_sessions_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_auth_sessions_expiry" CHECK (expires_at > created_at),
	CONSTRAINT "ck_auth_sessions_revoked" CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
--> statement-breakpoint
CREATE TABLE "expense_images" (
	"expense_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_expense_images" PRIMARY KEY("expense_id"),
	CONSTRAINT "uq_expense_images_image" UNIQUE("image_id")
);
--> statement-breakpoint
CREATE TABLE "expense_splits" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"shares" integer,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_expense_splits" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "ck_expense_splits_amount" CHECK (amount_cents BETWEEN 0 AND 999999999),
	CONSTRAINT "ck_expense_splits_shares" CHECK (shares IS NULL OR shares BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"recorder_member_id" uuid NOT NULL,
	"payer_member_id" uuid NOT NULL,
	"title" varchar(60) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" varchar(16) NOT NULL,
	"occurred_on" date NOT NULL,
	"split_mode" varchar(8) NOT NULL,
	"note" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_expenses" PRIMARY KEY("id"),
	CONSTRAINT "uq_expenses_ledger_id_id" UNIQUE("ledger_id","id"),
	CONSTRAINT "ck_expenses_title" CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
	CONSTRAINT "ck_expenses_amount" CHECK (amount_cents BETWEEN 1 AND 999999999),
	CONSTRAINT "ck_expenses_category" CHECK (category IN ('DINING','TRANSPORT','TICKET','LODGING','SHOPPING','OTHER')),
	CONSTRAINT "ck_expenses_split_mode" CHECK (split_mode IN ('EQUAL','SHARES','AMOUNT')),
	CONSTRAINT "ck_expenses_version" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"operation" varchar(160) NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" smallint NOT NULL,
	"response_body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_idempotency_keys" PRIMARY KEY("user_id","operation","key"),
	CONSTRAINT "ck_idempotency_keys_hash" CHECK (request_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_idempotency_keys_status" CHECK (response_status BETWEEN 200 AND 299),
	CONSTRAINT "ck_idempotency_keys_expiry" CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid,
	"uploaded_by_user_id" uuid NOT NULL,
	"kind" varchar(8) NOT NULL,
	"mime_type" varchar(16) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_image_assets" PRIMARY KEY("id"),
	CONSTRAINT "uq_image_assets_ledger_id_id" UNIQUE("ledger_id","id"),
	CONSTRAINT "ck_image_assets_kind" CHECK (kind IN ('COVER','RECEIPT')),
	CONSTRAINT "ck_image_assets_mime" CHECK (mime_type IN ('image/jpeg','image/png')),
	CONSTRAINT "ck_image_assets_bytes" CHECK (byte_size BETWEEN 1 AND 1048576 AND octet_length(content) = byte_size),
	CONSTRAINT "ck_image_assets_pixels" CHECK (width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096 AND width::bigint * height <= 16000000),
	CONSTRAINT "ck_image_assets_hash" CHECK (sha256 ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_invitations" PRIMARY KEY("id"),
	CONSTRAINT "uq_invitations_code" UNIQUE("code"),
	CONSTRAINT "ck_invitations_code" CHECK (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
	CONSTRAINT "ck_invitations_expiry" CHECK (expires_at > created_at),
	CONSTRAINT "ck_invitations_revoked" CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
--> statement-breakpoint
CREATE TABLE "ledger_members" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_ledger_members" PRIMARY KEY("id"),
	CONSTRAINT "uq_ledger_members_ledger_user" UNIQUE("ledger_id","user_id"),
	CONSTRAINT "uq_ledger_members_ledger_id_id" UNIQUE("ledger_id","id")
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"cover_key" varchar(30) DEFAULT 'mountain',
	"cover_image_id" uuid,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_ledgers" PRIMARY KEY("id"),
	CONSTRAINT "ck_ledgers_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
	CONSTRAINT "ck_ledgers_cover" CHECK (num_nonnulls(cover_key, cover_image_id) = 1),
	CONSTRAINT "ck_ledgers_status" CHECK (status IN ('ACTIVE','SETTLING','SETTLED')),
	CONSTRAINT "ck_ledgers_version" CHECK (version > 0),
	CONSTRAINT "ck_ledgers_settled" CHECK ((status = 'SETTLED') = (settled_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "operation_logs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"ledger_id" uuid,
	"action" varchar(40) NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"target_id" uuid,
	"request_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_operation_logs" PRIMARY KEY("id"),
	CONSTRAINT "ck_operation_logs_details" CHECK (jsonb_typeof(details) = 'object')
);
--> statement-breakpoint
CREATE TABLE "settlement_batches" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"expense_total_cents" bigint NOT NULL,
	"transfer_total_cents" bigint NOT NULL,
	"transfer_count" smallint NOT NULL,
	"net_snapshot" jsonb NOT NULL,
	"algorithm_version" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_settlement_batches" PRIMARY KEY("id"),
	CONSTRAINT "uq_settlement_batches_ledger" UNIQUE("ledger_id"),
	CONSTRAINT "uq_settlement_batches_ledger_id_id" UNIQUE("ledger_id","id"),
	CONSTRAINT "ck_settlement_batches_version" CHECK (source_version > 0),
	CONSTRAINT "ck_settlement_batches_totals" CHECK (expense_total_cents >= 0 AND transfer_total_cents >= 0),
	CONSTRAINT "ck_settlement_batches_count" CHECK (transfer_count BETWEEN 0 AND 11),
	CONSTRAINT "ck_settlement_batches_snapshot" CHECK (jsonb_typeof(net_snapshot) = 'array'),
	CONSTRAINT "ck_settlement_batches_zero" CHECK ((transfer_count = 0) = (transfer_total_cents = 0))
);
--> statement-breakpoint
CREATE TABLE "settlement_transfers" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"sequence" smallint NOT NULL,
	"payer_member_id" uuid NOT NULL,
	"payee_member_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" varchar(8) DEFAULT 'PENDING' NOT NULL,
	"registered_by_member_id" uuid,
	"registered_at" timestamp with time zone,
	"registration_note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_settlement_transfers" PRIMARY KEY("id"),
	CONSTRAINT "uq_settlement_transfers_batch_sequence" UNIQUE("batch_id","sequence"),
	CONSTRAINT "ck_settlement_transfers_amount" CHECK (amount_cents > 0),
	CONSTRAINT "ck_settlement_transfers_sequence" CHECK (sequence BETWEEN 1 AND 11),
	CONSTRAINT "ck_settlement_transfers_parties" CHECK (payer_member_id <> payee_member_id),
	CONSTRAINT "ck_settlement_transfers_status" CHECK (status IN ('PENDING','PAID')),
	CONSTRAINT "ck_settlement_transfers_registration" CHECK ((status = 'PENDING' AND registered_by_member_id IS NULL AND registered_at IS NULL AND registration_note IS NULL) OR (status = 'PAID' AND registered_by_member_id IS NOT NULL AND registered_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(30) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"notification_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_users" PRIMARY KEY("id"),
	CONSTRAINT "uq_users_email" UNIQUE("email"),
	CONSTRAINT "ck_users_username" CHECK (char_length(username) BETWEEN 2 AND 30),
	CONSTRAINT "ck_users_email" CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
	CONSTRAINT "ck_users_password_hash" CHECK (password_hash LIKE '$argon2id$%')
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "fk_auth_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expense_images" ADD CONSTRAINT "fk_expense_images_ledger_id_expense_id" FOREIGN KEY ("ledger_id","expense_id") REFERENCES "public"."expenses"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expense_images" ADD CONSTRAINT "fk_expense_images_ledger_id_image_id" FOREIGN KEY ("ledger_id","image_id") REFERENCES "public"."image_assets"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "fk_expense_splits_ledger_id_expense_id" FOREIGN KEY ("ledger_id","expense_id") REFERENCES "public"."expenses"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "fk_expense_splits_ledger_id_member_id" FOREIGN KEY ("ledger_id","member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "fk_expenses_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "fk_expenses_ledger_id_recorder_member_id" FOREIGN KEY ("ledger_id","recorder_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "fk_expenses_ledger_id_payer_member_id" FOREIGN KEY ("ledger_id","payer_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "fk_idempotency_keys_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "fk_image_assets_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "fk_image_assets_uploaded_by_user_id" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "fk_invitations_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "fk_invitations_ledger_id_created_by_member_id" FOREIGN KEY ("ledger_id","created_by_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_members" ADD CONSTRAINT "fk_ledger_members_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_members" ADD CONSTRAINT "fk_ledger_members_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "fk_ledgers_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "fk_ledgers_cover" FOREIGN KEY ("id","cover_image_id") REFERENCES "public"."image_assets"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "operation_logs" ADD CONSTRAINT "fk_operation_logs_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "operation_logs" ADD CONSTRAINT "fk_operation_logs_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "fk_settlement_batches_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "fk_settlement_batches_ledger_id_created_by_member_id" FOREIGN KEY ("ledger_id","created_by_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "fk_settlement_transfers_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "fk_settlement_transfers_ledger_id_batch_id" FOREIGN KEY ("ledger_id","batch_id") REFERENCES "public"."settlement_batches"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "fk_settlement_transfers_ledger_id_payer_member_id" FOREIGN KEY ("ledger_id","payer_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "fk_settlement_transfers_ledger_id_payee_member_id" FOREIGN KEY ("ledger_id","payee_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "fk_settlement_transfers_ledger_id_registered_by_member_id" FOREIGN KEY ("ledger_id","registered_by_member_id") REFERENCES "public"."ledger_members"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_auth_sessions_user" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_auth_sessions_expiry" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ix_expense_splits_member" ON "expense_splits" USING btree ("ledger_id","member_id");--> statement-breakpoint
CREATE INDEX "ix_expenses_list" ON "expenses" USING btree ("ledger_id","occurred_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_expenses_category" ON "expenses" USING btree ("ledger_id","category","occurred_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_expenses_payer" ON "expenses" USING btree ("ledger_id","payer_member_id","occurred_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_idempotency_keys_expiry" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ix_image_assets_temporary" ON "image_assets" USING btree ("created_at") WHERE ledger_id IS NULL;--> statement-breakpoint
CREATE INDEX "ix_image_assets_ledger" ON "image_assets" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "ix_invitations_ledger_time" ON "invitations" USING btree ("ledger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invitations_current" ON "invitations" USING btree ("ledger_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_ledger_members_user_archive" ON "ledger_members" USING btree ("user_id","archived_at","joined_at");--> statement-breakpoint
CREATE INDEX "ix_ledgers_creator" ON "ledgers" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_operation_logs_ledger_time" ON "operation_logs" USING btree ("ledger_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_operation_logs_request" ON "operation_logs" USING btree ("request_id");