CREATE TABLE "notifications" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"ledger_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" varchar(120),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_notifications" PRIMARY KEY("id"),
	CONSTRAINT "ck_notifications_type" CHECK (type IN ('SETTLEMENT_REMINDER')),
	CONSTRAINT "ck_notifications_parties" CHECK (recipient_user_id <> actor_user_id),
	CONSTRAINT "ck_notifications_amount" CHECK (amount_cents > 0),
	CONSTRAINT "ck_notifications_note" CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 120),
	CONSTRAINT "ck_notifications_read_at" CHECK (read_at IS NULL OR read_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "uq_settlement_transfers_ledger_id_id" UNIQUE("ledger_id","id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_recipient_user_id" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_ledger_id" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_ledger_id_transfer_id" FOREIGN KEY ("ledger_id","transfer_id") REFERENCES "public"."settlement_transfers"("ledger_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_notifications_recipient_time" ON "notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_notifications_recipient_unread" ON "notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_notifications_transfer_time" ON "notifications" USING btree ("ledger_id","transfer_id","created_at" DESC NULLS LAST);
