import { migrate } from "../src/migrate.ts";

const connectionString = process.env.DATABASE_URL_MIGRATOR;
if (connectionString === undefined) {
  throw new Error("DATABASE_URL_MIGRATOR manquante : copier .env.example en .env");
}

await migrate({ connectionString });
console.log("Migrations appliquées");
