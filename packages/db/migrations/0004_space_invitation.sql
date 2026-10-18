CREATE TABLE "space_invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "space_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "space_invitation" ADD CONSTRAINT "space_invitation_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_invitation" ADD CONSTRAINT "space_invitation_invited_by_identity_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_invitation_space_id_idx" ON "space_invitation" USING btree ("space_id");--> statement-breakpoint
-- L'app lit et écrit les invitations ; une invitation acceptée garde sa ligne.
GRANT SELECT, INSERT, UPDATE ON "space_invitation" TO app;
