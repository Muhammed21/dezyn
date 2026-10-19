import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import type { OutgoingEmail } from "#platform/mailer.ts";
import { schema } from "@repo/db";

import { type App, BASE_URL, GRACE, WEB_URL } from "./authorization-flow.ts";

export const makeOutbox = () => {
  const sent: OutgoingEmail[] = [];
  return { sent, mailer: { send: async (email: OutgoingEmail) => void sent.push(email) } };
};

export const invite = (
  app: App,
  {
    accessToken,
    spaceId,
    email = GRACE.email,
  }: { accessToken: string; spaceId: string; email?: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/invitations`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });

export const personalSpaceOf = async (db: PostgresDatabase, userId: string) => {
  const [membership] = await db.orm
    .select({ spaceId: schema.spaceMember.spaceId })
    .from(schema.spaceMember)
    .where(eq(schema.spaceMember.userId, userId));
  return membership?.spaceId ?? "";
};

export const switchToTeam = (db: PostgresDatabase, spaceId: string) =>
  db.orm.update(schema.space).set({ plan: "team" }).where(eq(schema.space.id, spaceId));

export const seedTeamSpace = async (db: PostgresDatabase) => {
  const spaceId = randomUUID();
  await db.orm
    .insert(schema.space)
    .values({ id: spaceId, name: "Studio Grace", plan: "team", createdAt: new Date() });
  return spaceId;
};

export const seedTeamSpaceWith = async (
  db: PostgresDatabase,
  { userId, role }: { userId: string; role: "owner" | "editor" },
) => {
  const spaceId = await seedTeamSpace(db);
  await db.orm
    .insert(schema.spaceMember)
    .values({ id: randomUUID(), spaceId, userId, role, joinedAt: new Date() });
  return spaceId;
};

export const tokenOf = (email: OutgoingEmail | undefined) =>
  new RegExp(`${WEB_URL}/invitations/([A-Za-z0-9_-]{43})`).exec(email?.text ?? "")?.[1] ?? "";

export const hashOf = (token: string) => createHash("sha256").update(token).digest("base64url");
