ALTER TABLE "project" ADD COLUMN "history_purged_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "history_purged_at" timestamp with time zone;--> statement-breakpoint
-- history_maintainer purge l'historique d'un espace à sa limite : il lit les espaces, les projets et leurs propriétaires, et ne met à jour que le compteur et la trace de purge du projet (ADR 0042 §7).
GRANT SELECT ON "space", "project", "space_member" TO history_maintainer;--> statement-breakpoint
GRANT SELECT ("id", "email", "name") ON "identity_user" TO history_maintainer;--> statement-breakpoint
GRANT UPDATE ("stored_bytes", "history_purged_before", "history_purged_at") ON "project" TO history_maintainer;
