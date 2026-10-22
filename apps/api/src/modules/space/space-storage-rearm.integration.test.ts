import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import type { OutgoingEmail } from "#platform/mailer.ts";
import { ADA, type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { seedStoredBytes } from "#testing/project-storage.ts";
import { makeOutbox } from "#testing/space-fixtures.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const { space } = schema;

const UNDER_FREE_ALERT = 300_000_000;

const JUST_UNDER_FREE_ALERT = 399_999_999;

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const seedAlertedSpace = (db: PostgresDatabase, spaceId: string) =>
  db.orm
    .update(space)
    .set({ storageAlertedAt: new Date("2026-10-01T09:00:00Z") })
    .where(eq(space.id, spaceId));

const alertedAtOf = async (db: PostgresDatabase, spaceId: string) => {
  const [row] = await db.orm
    .select({ alertedAt: space.storageAlertedAt })
    .from(space)
    .where(eq(space.id, spaceId));
  return row?.alertedAt;
};

const storageAlertsTo = (sent: readonly OutgoingEmail[]) =>
  sent.filter(({ subject }) => subject.includes("stockage")).map(({ to }) => to);

const callTool = async (
  app: App,
  { accessToken, name, args }: { accessToken: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const { result } = await response.json();
  return result.structuredContent;
};

const seedClosedBatch = async (
  app: App,
  {
    accessToken,
    projectId,
    tokens,
  }: { accessToken: string; projectId: string; tokens: readonly object[] },
) => {
  const written = await callTool(app, {
    accessToken,
    name: "write_tokens",
    args: { projectId, tokens },
  });
  await callTool(app, { accessToken, name: "close_proposal_batch", args: { projectId } });
  return written;
};

const validate = (
  app: App,
  { accessToken, proposalId }: { accessToken: string; proposalId: string },
) =>
  app.request(`${BASE_URL}/v1/proposals/${proposalId}/validate`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });

describe("une écriture sous 80 % réarme l'alerte de stockage (ADR 0032 §4)", () => {
  it("un ajout qui laisse l'espace sous 80 % remet storage_alerted_at à vide", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await seedAlertedSpace(db, seeded.spaceId);
      await seedStoredBytes(db, { projectId: seeded.projectId, bytes: UNDER_FREE_ALERT });

      await addToken(app, { ...seeded, token: makeColorToken() });

      expect(await alertedAtOf(db, seeded.spaceId)).toBeNull();
    }));

  it("un remplacement qui repasse sous 80 %, puis un ajout qui remonte, envoient une nouvelle alerte", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await addToken(app, { ...seeded, token: makeColorToken() });
        const written = await seedClosedBatch(app, {
          ...seeded,
          tokens: [makeColorToken({ $value: NIGHT_BLUE })],
        });
        await seedAlertedSpace(db, seeded.spaceId);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: UNDER_FREE_ALERT });
        await validate(app, { ...seeded, proposalId: written.proposals[0].id });
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond.second" }) });

        expect(storageAlertsTo(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("la validation d'une proposition qui porte l'espace à 80 % alerte et réussit", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        const written = await seedClosedBatch(app, { ...seeded, tokens: [makeColorToken()] });
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const response = await validate(app, { ...seeded, proposalId: written.proposals[0].id });

        expect(response.status).toBe(200);
        expect(storageAlertsTo(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un declare_figma_states qui porte l'espace à 80 % alerte et réussit", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await addToken(app, { ...seeded, token: makeColorToken() });
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const declared = await callTool(app, {
          ...seeded,
          name: "declare_figma_states",
          args: {
            projectId: seeded.projectId,
            states: [{ name: makeColorToken().name, state: "synced" }],
          },
        });

        expect(declared.states).toHaveLength(1);
        expect(storageAlertsTo(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });
});
