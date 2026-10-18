CREATE TABLE "mode" (
	"id" uuid PRIMARY KEY NOT NULL,
	"modifier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "mode_modifier_id_name_key" UNIQUE("modifier_id","name")
);
--> statement-breakpoint
CREATE TABLE "modifier" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "modifier_project_id_name_key" UNIQUE("project_id","name")
);
--> statement-breakpoint
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
	"mode_id" uuid,
	"value" jsonb NOT NULL,
	CONSTRAINT "token_value_token_id_mode_id_key" UNIQUE NULLS NOT DISTINCT("token_id","mode_id")
);
--> statement-breakpoint
ALTER TABLE "mode" ADD CONSTRAINT "mode_modifier_id_modifier_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier" ADD CONSTRAINT "modifier_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_value" ADD CONSTRAINT "token_value_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_value" ADD CONSTRAINT "token_value_mode_id_mode_id_fk" FOREIGN KEY ("mode_id") REFERENCES "public"."mode"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- L'app ajoute et lit les modificateurs, les modes, les tokens et leurs valeurs par mode.
GRANT SELECT, INSERT ON "modifier", "mode", "token", "token_value" TO app;
