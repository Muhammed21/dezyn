CREATE TABLE "token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "token_project_id_name_key" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "token_value" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_id" uuid NOT NULL,
	"mode" text,
	"value" jsonb NOT NULL,
	CONSTRAINT "token_value_token_id_mode_key" UNIQUE NULLS NOT DISTINCT("token_id","mode")
);
--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_value" ADD CONSTRAINT "token_value_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- L'app ajoute et lit les tokens et leurs valeurs par mode.
GRANT SELECT, INSERT ON "token", "token_value" TO app;
