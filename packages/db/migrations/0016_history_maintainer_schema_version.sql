-- history_maintainer lit la version du schéma, comme app, pour que le Worker dezyn-purge vérifie la base avant de purger (ADR 0042, note d'implémentation 7).
GRANT USAGE ON SCHEMA drizzle TO history_maintainer;--> statement-breakpoint
GRANT SELECT ON drizzle.__drizzle_migrations TO history_maintainer;
