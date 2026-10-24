CREATE TABLE "identity_rate_limit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "identity_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
-- better-auth compte les limites de débit de chaque IP dans cette table, partagée par toutes les instances de l'API (ADR 0034).
GRANT SELECT, INSERT, UPDATE, DELETE ON "identity_rate_limit" TO app;
