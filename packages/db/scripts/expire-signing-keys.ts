import { expireSigningKeys } from "../src/secret-versions.ts";

const connectionString = process.env.DATABASE_URL_MIGRATOR;
if (connectionString === undefined) {
  throw new Error("DATABASE_URL_MIGRATOR manquante : URL du rôle migrator");
}

console.log(await expireSigningKeys({ connectionString, now: new Date() }));
