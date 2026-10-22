ALTER TABLE "project" ADD COLUMN "stored_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "space" ADD COLUMN "storage_alerted_at" timestamp with time zone;--> statement-breakpoint
-- Le compteur d'octets d'un projet suit chaque écriture de ses données (ADR 0032) ; la date d'alerte de l'espace se pose par le droit UPDATE déjà accordé sur "space".
GRANT UPDATE ("stored_bytes") ON "project" TO app;
