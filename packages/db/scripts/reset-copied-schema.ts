import { resetCopiedSchema } from "../src/reset-copied-schema.ts";

const REFUSED = 3;

const connectionString = process.env.DATABASE_URL_OWNER;
if (connectionString === undefined) {
  throw new Error("DATABASE_URL_OWNER manquante : URL du rôle propriétaire de la base");
}

const outcome = await resetCopiedSchema({ connectionString });
if (outcome.kind === "refused") {
  console.error(`Remise à zéro refusée, des tables ont des lignes : ${outcome.tables.join(", ")}`);
  process.exitCode = REFUSED;
} else {
  console.log("Schéma copié remis à zéro");
}
