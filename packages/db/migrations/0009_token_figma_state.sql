CREATE TABLE "token_figma_state" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"declared_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_figma_state" ADD CONSTRAINT "token_figma_state_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_figma_state" ADD CONSTRAINT "token_figma_state_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- L'IA déclare l'état Figma d'un token ; une nouvelle déclaration remplace la précédente.
GRANT SELECT, INSERT, UPDATE ("state", "declared_at", "user_id", "client_id") ON "token_figma_state" TO app;
