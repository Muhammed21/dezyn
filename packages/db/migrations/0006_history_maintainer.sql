-- history_maintainer lit et supprime les entrées de l'historique pour la purge, sans les modifier ni en ajouter (ADR 0019 §2).
GRANT SELECT, DELETE ON "history_entry" TO history_maintainer;
