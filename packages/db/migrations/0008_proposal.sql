CREATE TABLE "proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"token_name" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_batch" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"intent" text,
	"state" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_written_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_batch_id_proposal_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."proposal_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_batch" ADD CONSTRAINT "proposal_batch_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_batch" ADD CONSTRAINT "proposal_batch_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_batch_open_key" ON "proposal_batch" USING btree ("project_id","user_id","client_id") WHERE "proposal_batch"."state" = 'open';--> statement-breakpoint
-- L'app ouvre les lots de propositions et y écrit les propositions ; un éditeur ne change que leur statut.
GRANT SELECT, INSERT ON "proposal_batch", "proposal" TO app;
--> statement-breakpoint
GRANT UPDATE ("status") ON "proposal" TO app;
--> statement-breakpoint
-- Les lots de propositions se ferment et notent la date de leur dernière écriture.
GRANT UPDATE ("state", "last_written_at") ON "proposal_batch" TO app;
--> statement-breakpoint
-- Valider une modification remplace la description du token et ses valeurs par mode.
GRANT UPDATE ("description") ON "token" TO app;
--> statement-breakpoint
GRANT DELETE ON "token_value" TO app;
