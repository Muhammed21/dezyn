CREATE TABLE "token_value_reference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_value_id" uuid NOT NULL,
	"field" text NOT NULL,
	"referenced_token_id" uuid NOT NULL,
	CONSTRAINT "token_value_reference_token_value_id_field_key" UNIQUE("token_value_id","field")
);
--> statement-breakpoint
ALTER TABLE "token_value_reference" ADD CONSTRAINT "token_value_reference_token_value_id_token_value_id_fk" FOREIGN KEY ("token_value_id") REFERENCES "public"."token_value"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_value_reference" ADD CONSTRAINT "token_value_reference_referenced_token_id_token_id_fk" FOREIGN KEY ("referenced_token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- L'app garde chaque référence de champ d'une valeur composée vers le token référencé ; remplacer une valeur efface ses références par cascade.
GRANT SELECT, INSERT ON "token_value_reference" TO app;
