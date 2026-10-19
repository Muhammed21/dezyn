CREATE TABLE "token_figma_state" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"figma_variables" jsonb,
	"declared_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"proposal_id" uuid
);
--> statement-breakpoint
ALTER TABLE "token_figma_state" ADD CONSTRAINT "token_figma_state_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_figma_state" ADD CONSTRAINT "token_figma_state_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_figma_state" ADD CONSTRAINT "token_figma_state_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- L'IA déclare l'état Figma d'un token ; une nouvelle déclaration remplace la précédente, et la validation de la proposition née d'un divergent le synchronise.
GRANT SELECT, INSERT, UPDATE ("state", "figma_variables", "declared_at", "user_id", "client_id", "proposal_id") ON "token_figma_state" TO app;
