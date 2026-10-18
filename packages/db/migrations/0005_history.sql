CREATE TABLE "history_author" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid,
	"deleted_member_number" integer,
	CONSTRAINT "history_author_space_id_user_id_key" UNIQUE("space_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "history_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"action" text NOT NULL,
	"author_id" uuid NOT NULL,
	"client_id" text,
	"before" jsonb,
	"after" jsonb,
	"correlation_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "history_author" ADD CONSTRAINT "history_author_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_author" ADD CONSTRAINT "history_author_user_id_identity_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_author_id_history_author_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."history_author"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_entry_project_id_occurred_at_id_idx" ON "history_entry" USING btree ("project_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "project_space_id_idx" ON "project" USING btree ("space_id");--> statement-breakpoint
-- L'app crée et lit les projets.
GRANT SELECT, INSERT ON "project" TO app;--> statement-breakpoint
-- L'app ajoute et lit les auteurs et les entrées de l'historique, sans les modifier ni les supprimer (ADR 0019 §1).
GRANT SELECT, INSERT ON "history_author", "history_entry" TO app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "history_entry" FROM app;
