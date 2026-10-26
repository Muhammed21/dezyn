import { secretVersionsInUse } from "../src/secret-versions.ts";

const connectionString = process.env.DATABASE_URL_MIGRATOR;
if (connectionString === undefined) {
  throw new Error("DATABASE_URL_MIGRATOR manquante : URL du rôle migrator");
}

const versions = await secretVersionsInUse({ connectionString, now: new Date() });
console.log(versions.join("\n"));
