import { parseArgs } from "node:util";

import { createPostgresDatabase } from "#db";
import { assertSchemaVersion, LATEST_MIGRATION } from "@repo/db";
import { ok } from "@repo/result";

import { buildApi } from "../src/build-api.ts";
import { seedDevData } from "../src/dev/dev-data.ts";

const required = (variable: string): string => {
  const value = process.env[variable];
  if (value === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return value;
};

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "Dev" },
    email: { type: "string", default: "dev@dezyn.test" },
    password: { type: "string", default: "mot-de-passe-de-dev" },
  },
});
const user = { name: values.name, email: values.email, password: values.password };

const databaseUrl = required("DATABASE_URL");
const baseURL = required("BETTER_AUTH_URL");
await assertSchemaVersion({ connectionString: databaseUrl, migration: LATEST_MIGRATION });
const db = createPostgresDatabase({ url: databaseUrl });
try {
  const { app, modules } = await buildApi({
    db,
    mailer: { send: async () => ok(undefined) },
    log: () => undefined,
    authSecret: required("BETTER_AUTH_SECRET"),
    baseURL,
    trustedIpHeader: "x-forwarded-for",
    webUrl: process.env.WEB_URL ?? "http://127.0.0.1:5173",
  });
  const seeded = await seedDevData({
    app,
    db,
    createProject: modules.projects.createProject,
    user,
    baseURL,
    clientIp: "127.0.0.1",
  });
  if (!seeded.ok) {
    console.error(`${user.email} existe déjà : lancer pnpm db:reset avant de reseeder`);
    process.exitCode = 1;
  } else {
    console.log(`Utilisateur : ${user.email} / ${user.password}`);
    console.log(`Espace d'équipe : Studio ${user.name} (${seeded.value.spaceId})`);
    console.log(`Projet : ${user.name} (${seeded.value.projectId})`);
  }
} finally {
  await db.close();
}
