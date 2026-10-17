import { LATEST_MIGRATION } from "@repo/db";

import { startApi } from "./start-api.ts";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL manquante : copier .env.example en .env");
}

const api = await startApi({
  databaseUrl,
  migration: LATEST_MIGRATION,
  port: Number(process.env.PORT ?? 3000),
});
console.log(`API prête sur ${api.url}`);
