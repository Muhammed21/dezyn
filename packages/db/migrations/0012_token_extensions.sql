ALTER TABLE "token" ADD COLUMN "extensions" jsonb;
--> statement-breakpoint
-- Un token garde les extensions qu'un outil y range sous sa propre clé, communes à tous ses modes, sans que dezyn les interprète (ADR 0030) ; valider une modification les remplace, comme la description.
GRANT UPDATE ("extensions") ON "token" TO app;
