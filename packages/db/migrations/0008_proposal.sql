CREATE TABLE "proposition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lot_id" uuid NOT NULL,
	"token_name" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposition_lot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"intention" text,
	"state" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposition" ADD CONSTRAINT "proposition_lot_id_proposition_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."proposition_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_lot" ADD CONSTRAINT "proposition_lot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_lot" ADD CONSTRAINT "proposition_lot_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposition_lot_open_key" ON "proposition_lot" USING btree ("project_id","user_id","client_id") WHERE "proposition_lot"."state" = 'open';--> statement-breakpoint
-- L'app ouvre les lots de propositions et y écrit les propositions ; un éditeur ne change que leur statut.
GRANT SELECT, INSERT ON "proposition_lot", "proposition" TO app;
--> statement-breakpoint
GRANT UPDATE ("status") ON "proposition" TO app;
