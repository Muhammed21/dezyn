CREATE TABLE "space" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_reason" text
);
--> statement-breakpoint
ALTER TABLE "space_member" ADD CONSTRAINT "space_member_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_member" ADD CONSTRAINT "space_member_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "space_member_open_space_id_user_id_idx" ON "space_member" USING btree ("space_id","user_id") WHERE "space_member"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "space_member_open_user_id_idx" ON "space_member" USING btree ("user_id") WHERE "space_member"."closed_at" IS NULL;--> statement-breakpoint
-- L'app lit et écrit les espaces et leurs membres ; une ligne de membre n'est jamais supprimée (ADR 0017 §1).
GRANT SELECT, INSERT, UPDATE ON "space", "space_member" TO app;
