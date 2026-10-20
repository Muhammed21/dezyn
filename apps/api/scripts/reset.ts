import { resetDevData } from "../src/dev/dev-data.ts";

const migratorUrl = process.env.DATABASE_URL_MIGRATOR;
if (migratorUrl === undefined) {
  throw new Error("DATABASE_URL_MIGRATOR manquante : copier .env.example en .env");
}

await resetDevData({ migratorUrl });
console.log("Utilisateurs et données liées supprimés");
