-- L'app lit la version du schéma au démarrage (ADR 0009 §4), sans droit de la modifier (§3).
GRANT USAGE ON SCHEMA drizzle TO app;
--> statement-breakpoint
GRANT SELECT ON drizzle.__drizzle_migrations TO app;
