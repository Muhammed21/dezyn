import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { z } from "zod";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";
import { err, ok, type Result } from "@repo/result";

export type DevUser = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type DevData = {
  readonly userId: string;
  readonly spaceId: string;
  readonly projectId: string;
};

type RequestHandler = {
  request(path: string, init: RequestInit): Response | Promise<Response>;
};

type CreateProject = (project: {
  readonly spaceId: string;
  readonly userId: string;
  readonly name: string;
  readonly correlationId: string;
}) => Promise<Result<{ readonly id: string }, unknown>>;

const SignedUp = z.object({ user: z.object({ id: z.string() }) });

export const seedDevData = async ({
  app,
  db,
  createProject,
  user,
  baseURL,
  clientIp,
}: {
  readonly app: RequestHandler;
  readonly db: PostgresDatabase;
  readonly createProject: CreateProject;
  readonly user: DevUser;
  readonly baseURL: string;
  readonly clientIp: string;
}): Promise<Result<DevData, "user_exists">> => {
  const signedUp = await app.request(`${baseURL}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": clientIp },
    body: JSON.stringify(user),
  });
  if (signedUp.status === 422) {
    return err("user_exists");
  }
  const {
    user: { id: userId },
  } = SignedUp.parse(await signedUp.json());
  const spaceId = randomUUID();
  const now = new Date();
  await db.orm.transaction(async (tx) => {
    await tx
      .insert(schema.space)
      .values({ id: spaceId, name: `Studio ${user.name}`, plan: "team", createdAt: now });
    await tx
      .insert(schema.spaceMember)
      .values({ id: randomUUID(), spaceId, userId, role: "owner", joinedAt: now });
  });
  const project = await createProject({ spaceId, userId, name: user.name, correlationId: "seed" });
  if (!project.ok) {
    throw new Error("Création du projet refusée");
  }
  return ok({ userId, spaceId, projectId: project.value.id });
};

const LOCAL_HOSTS: readonly string[] = ["127.0.0.1", "localhost"];

export const resetDevData = async ({ migratorUrl }: { readonly migratorUrl: string }) => {
  const { hostname } = new URL(migratorUrl);
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(`Vidage refusé : ${hostname} n'est pas une base locale`);
  }
  const client = new Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `TRUNCATE "space", "identity_session", "identity_account", "identity_verification",
        "identity_oauth_access_token", "identity_oauth_refresh_token", "identity_oauth_consent" CASCADE`,
    );
    await client.query('DELETE FROM "identity_oauth_client" WHERE "user_id" IS NOT NULL');
    await client.query('DELETE FROM "identity_user"');
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
};
