import { setTimeout as wait } from "node:timers/promises";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { bytesOfProjectRows, storageMeterOn, storedBytesOf } from "#testing/project-storage.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

import {
  postgresFigmaStateSynchronizer,
  postgresFigmaStateWriter,
} from "./infrastructure/postgres-tokens.ts";

const { identityOAuthClient, token } = schema;

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const SYNCED = { name: "couleur.fond.primaire", state: "synced" };

const DUPLICATED = {
  name: "couleur.fond.primaire",
  state: "duplicate_in_figma",
  figmaVariables: ["Couleurs/Fond/Primaire", "Couleurs/Fond/Primaire copie"],
};

const DIVERGED = {
  name: "couleur.fond.primaire",
  state: "diverged",
  figmaValue: { $value: NIGHT_BLUE },
};

const declareFigmaStates = async (
  app: App,
  {
    accessToken,
    projectId,
    states,
  }: { readonly accessToken: string; readonly projectId: string; readonly states: unknown },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "declare_figma_states", arguments: { projectId, states } },
  });
  const { result } = await response.json();
  return result.structuredContent;
};

const review = (
  app: App,
  {
    accessToken,
    proposalId,
    decision,
  }: { accessToken: string; proposalId: string; decision: "validate" | "reject" },
) =>
  app.request(`${BASE_URL}/v1/proposals/${proposalId}/${decision}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });

const seedComparedToken = async (app: App, db: Parameters<typeof seedProject>[1]) => {
  const seeded = await seedProject(app, db);
  await addToken(app, { ...seeded, token: makeColorToken() });
  return seeded;
};

const seedHeldDeclaration = async (db: PostgresDatabase, projectId: string) => {
  const [declared] = await db.orm
    .select({ tokenId: token.id, name: token.name })
    .from(token)
    .where(eq(token.projectId, projectId));
  const [client] = await db.orm
    .select({ clientId: identityOAuthClient.clientId })
    .from(identityOAuthClient);
  return {
    tokenId: String(declared?.tokenId),
    name: String(declared?.name),
    clientId: String(client?.clientId),
  };
};

const lockWaitIn = async (db: PostgresDatabase, attempts = 80): Promise<void> => {
  const {
    rows: [waiting],
  } = await db.orm.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()`,
  );
  if ((waiting?.count ?? 0) > 0 || attempts === 0) {
    return;
  }
  await wait(10);
  return lockWaitIn(db, attempts - 1);
};

const whileHolding = async (
  db: PostgresDatabase,
  {
    hold,
    meanwhile,
  }: {
    readonly hold: (tx: PostgresTransaction) => Promise<void>;
    readonly meanwhile: () => unknown;
  },
) => {
  const { concurrent } = await db.orm.transaction(async (tx) => {
    await hold(tx);
    const started = meanwhile();
    await lockWaitIn(db);
    return { concurrent: started };
  });
  return concurrent;
};

describe("le compteur d'un projet suit les états Figma (ADR 0032 §1 à §3)", () => {
  it("une première déclaration compte les états écrits", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedComparedToken(app, db);

      await declareFigmaStates(app, { ...seeded, states: [SYNCED] });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("une seconde déclaration qui change l'état d'un token garde le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedComparedToken(app, db);
      await declareFigmaStates(app, { ...seeded, states: [SYNCED] });

      await declareFigmaStates(app, { ...seeded, states: [DUPLICATED] });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it.each(["validate", "reject"] as const)(
    "la relecture (%s) d'une proposition de divergence garde le compteur exact",
    (decision) =>
      withIdentityApp(async (app, db) => {
        const seeded = await seedComparedToken(app, db);
        const declared = await declareFigmaStates(app, { ...seeded, states: [DIVERGED] });

        const response = await review(app, {
          ...seeded,
          proposalId: declared.states[0].proposal.id,
          decision,
        });

        expect(response.status).toBe(200);
        expect(await storedBytesOf(db, seeded.projectId)).toBe(
          await bytesOfProjectRows(db, seeded.projectId),
        );
      }),
  );

  it("deux déclarations simultanées d'un même token gardent le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedComparedToken(app, db);
      const held = await seedHeldDeclaration(db, seeded.projectId);

      await whileHolding(db, {
        hold: (tx) =>
          postgresFigmaStateWriter(tx, storageMeterOn(tx)).declare({
            projectId: seeded.projectId,
            states: [{ tokenId: held.tokenId, name: held.name, state: "synced", proposalId: null }],
            declaredAt: new Date(),
            userId: seeded.userId,
            clientId: held.clientId,
          }),
        meanwhile: () => declareFigmaStates(app, { ...seeded, states: [DUPLICATED] }),
      });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("une relecture de divergence pendant une déclaration garde le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedComparedToken(app, db);
      const declared = await declareFigmaStates(app, { ...seeded, states: [DIVERGED] });
      const held = await seedHeldDeclaration(db, seeded.projectId);

      await whileHolding(db, {
        hold: (tx) =>
          postgresFigmaStateWriter(tx, storageMeterOn(tx)).declare({
            projectId: seeded.projectId,
            states: [{ tokenId: held.tokenId, name: held.name, state: "synced", proposalId: null }],
            declaredAt: new Date(),
            userId: seeded.userId,
            clientId: held.clientId,
          }),
        meanwhile: () =>
          review(app, {
            ...seeded,
            proposalId: declared.states[0].proposal.id,
            decision: "reject",
          }),
      });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("une déclaration pendant le rejet d'une divergence garde le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedComparedToken(app, db);
      const declared = await declareFigmaStates(app, { ...seeded, states: [DIVERGED] });

      await whileHolding(db, {
        hold: (tx) =>
          postgresFigmaStateSynchronizer(tx, storageMeterOn(tx)).proposalRejected({
            proposalId: declared.states[0].proposal.id,
            token: { $value: NIGHT_BLUE },
          }),
        meanwhile: () => declareFigmaStates(app, { ...seeded, states: [DUPLICATED] }),
      });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));
});
