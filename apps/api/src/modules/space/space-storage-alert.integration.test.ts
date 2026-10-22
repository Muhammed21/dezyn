import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createPostgresDatabase, type PostgresDatabase } from "#db";
import type { LogRecord } from "#platform/logging.ts";
import type { OutgoingEmail } from "#platform/mailer.ts";
import { ADA, type App, GRACE } from "#testing/authorization-flow.ts";
import { withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { storedBytesOf } from "#testing/project-storage.ts";
import { makeOutbox, promoteToOwner, seedSpaceWithInvitedEditor } from "#testing/space-fixtures.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";
import { err } from "@repo/result";

const { project, space, spaceMember, token } = schema;

const JUST_UNDER_FREE_ALERT = 399_999_999;

const ABOVE_FREE_ALERT = 450_000_000;

const JUST_UNDER_TEAM_ALERT = 15_999_999_999;

const seedStoredBytes = (
  db: PostgresDatabase,
  { projectId, bytes }: { readonly projectId: string; readonly bytes: number },
) => db.orm.update(project).set({ storedBytes: bytes }).where(eq(project.id, projectId));

const seedProjectIn = async (
  db: PostgresDatabase,
  { spaceId, bytes }: { readonly spaceId: string; readonly bytes: number },
) => {
  const projectId = randomUUID();
  await db.orm.insert(project).values({
    id: projectId,
    spaceId,
    name: "Application mobile",
    createdAt: new Date(),
    storedBytes: bytes,
  });
  return projectId;
};

const breakStorageAlertMarking = async (migratorUrl: string) => {
  const migrator = createPostgresDatabase({ url: migratorUrl });
  try {
    await migrator.orm.execute(sql`
      CREATE FUNCTION refuse_storage_alert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'storage_alerted_at indisponible';
      END;
      $$ LANGUAGE plpgsql`);
    await migrator.orm.execute(sql`
      CREATE TRIGGER refuse_storage_alert BEFORE UPDATE OF storage_alerted_at ON space
      FOR EACH ROW EXECUTE FUNCTION refuse_storage_alert()`);
  } finally {
    await migrator.close();
  }
};

const alertedAtOf = async (db: PostgresDatabase, spaceId: string) => {
  const [row] = await db.orm
    .select({ alertedAt: space.storageAlertedAt })
    .from(space)
    .where(eq(space.id, spaceId));
  return row?.alertedAt;
};

const isStorageAlert = (email: OutgoingEmail) => email.subject.includes("stockage");

const alertsOf = (sent: readonly OutgoingEmail[]) => sent.filter(isStorageAlert);

const recipientsOf = (sent: readonly OutgoingEmail[]) =>
  alertsOf(sent)
    .map(({ to }) => to)
    .toSorted();

const addColorToken = (
  app: App,
  seeded: { readonly accessToken: string; readonly projectId: string },
  name = "couleur.fond.primaire",
) => addToken(app, { ...seeded, token: makeColorToken({ name }) });

const seedTeamSpaceNearAlert = async (
  app: App,
  db: PostgresDatabase,
  outbox: ReturnType<typeof makeOutbox>,
) => {
  const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
  const projectId = await seedProjectIn(db, { spaceId, bytes: JUST_UNDER_TEAM_ALERT });
  return { ada, grace, spaceId, projectId };
};

describe("l'ajout d'un token qui porte l'espace à 80 % prévient ses propriétaires (ADR 0032 §4)", () => {
  it("l'ajout qui franchit 80 % d'un espace Free envoie un email à son propriétaire", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const response = await addColorToken(app, seeded);

        expect(response.status).toBe(201);
        expect(recipientsOf(outbox.sent)).toEqual([ADA.email]);
        expect(await alertedAtOf(db, seeded.spaceId)).toBeInstanceOf(Date);
      },
      { mailer: outbox.mailer },
    );
  });

  it("l'email nomme l'espace, le stockage consommé et la limite", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: ABOVE_FREE_ALERT });

        await addColorToken(app, seeded);

        const [alert] = alertsOf(outbox.sent);
        expect(alert?.subject).toContain(`« ${ADA.name} »`);
        expect(alert?.text).toContain("450 Mo sur 500 Mo");
      },
      { mailer: outbox.mailer },
    );
  });

  it("l'email nomme le projet qui consomme le plus et, en Free, le plan Team", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: 100_000_000 });
        await seedProjectIn(db, { spaceId: seeded.spaceId, bytes: 350_000_000 });

        await addColorToken(app, seeded);

        const [alert] = alertsOf(outbox.sent);
        expect(alert?.text).toContain(
          "Le projet « Application mobile » est celui qui consomme le plus.",
        );
        expect(alert?.text).toContain("Le plan Team offre 20 Go de stockage.");
      },
      { mailer: outbox.mailer },
    );
  });

  it("l'ajout qui reste sous 80 % n'envoie rien", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);

        const response = await addColorToken(app, seeded);

        expect(response.status).toBe(201);
        expect(alertsOf(outbox.sent)).toEqual([]);
        expect(await alertedAtOf(db, seeded.spaceId)).toBeNull();
      },
      { mailer: outbox.mailer },
    );
  });

  it("le stockage de l'espace cumule ses projets", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: 200_000_000 });
        await seedProjectIn(db, { spaceId: seeded.spaceId, bytes: 199_999_999 });

        await addColorToken(app, seeded);

        expect(recipientsOf(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur et un non-membre ne reçoivent rien", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { grace, projectId } = await seedTeamSpaceNearAlert(app, db, outbox);

        const response = await addColorToken(app, { accessToken: grace.accessToken, projectId });

        expect(response.status).toBe(201);
        expect(recipientsOf(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("chaque propriétaire ouvert reçoit l'email", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedTeamSpaceNearAlert(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        await addColorToken(app, { accessToken: ada.accessToken, projectId });

        expect(recipientsOf(outbox.sent)).toEqual([ADA.email, GRACE.email].toSorted());
      },
      { mailer: outbox.mailer },
    );
  });

  it("un propriétaire parti ne reçoit rien", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedTeamSpaceNearAlert(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });
        await db.orm
          .update(spaceMember)
          .set({ closedAt: new Date(), closedReason: "left" })
          .where(and(eq(spaceMember.spaceId, spaceId), eq(spaceMember.userId, grace.userId)));

        await addColorToken(app, { accessToken: ada.accessToken, projectId });

        expect(recipientsOf(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un ajout suivant au-dessus de 80 % n'envoie rien", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });
        await addColorToken(app, seeded);

        const response = await addColorToken(app, seeded, "couleur.fond.second");

        expect(response.status).toBe(201);
        expect(alertsOf(outbox.sent)).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un espace Free déjà au-dessus de 80 % et jamais alerté l'est à son prochain ajout", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: ABOVE_FREE_ALERT });

        await addColorToken(app, seeded);

        expect(recipientsOf(outbox.sent)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("deux ajouts simultanés qui franchissent 80 % n'envoient qu'une alerte", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const responses = await Promise.all([
          addColorToken(app, seeded, "couleur.fond.primaire"),
          addColorToken(app, seeded, "couleur.fond.second"),
        ]);

        expect(responses.map(({ status }) => status)).toEqual([201, 201]);
        expect(alertsOf(outbox.sent)).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un ajout refusé n'alerte pas", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await addColorToken(app, seeded);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: ABOVE_FREE_ALERT });

        const response = await addColorToken(app, seeded);

        expect(response.status).toBe(400);
        expect(alertsOf(outbox.sent)).toEqual([]);
        expect(await alertedAtOf(db, seeded.spaceId)).toBeNull();
      },
      { mailer: outbox.mailer },
    );
  });

  it("un email envoyé ne journalise aucun échec", () => {
    const outbox = makeOutbox();
    const records: LogRecord[] = [];
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        await addColorToken(app, seeded);

        expect(recipientsOf(outbox.sent)).toEqual([ADA.email]);
        expect(records).not.toContainEqual(
          expect.objectContaining({ msg: "storage_alert_unsent" }),
        );
      },
      {
        mailer: outbox.mailer,
        log: (record) => {
          records.push(record);
        },
      },
    );
  });

  it("une alerte qui ne peut pas se poser n'écrit pas le token à moitié", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const seeded = await seedProject(app, db);
      await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });
      await breakStorageAlertMarking(migratorUrl);

      const response = await addColorToken(app, seeded);

      expect(response.status).toBe(500);
      expect(
        await db.orm.select().from(token).where(eq(token.projectId, seeded.projectId)),
      ).toEqual([]);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(JUST_UNDER_FREE_ALERT);
    }));

  it("un échec SMTP laisse l'ajout réussir, le compteur à jour, et journalise l'échec", () => {
    const records: LogRecord[] = [];
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const response = await addColorToken(app, seeded);

        expect(response.status).toBe(201);
        expect(await storedBytesOf(db, seeded.projectId)).toBeGreaterThan(JUST_UNDER_FREE_ALERT);
        expect(await alertedAtOf(db, seeded.spaceId)).toBeInstanceOf(Date);
        expect(records).toContainEqual(
          expect.objectContaining({
            level: "error",
            msg: "storage_alert_unsent",
            spaceId: seeded.spaceId,
            to: ADA.email,
          }),
        );
      },
      {
        mailer: { send: async () => err("mail_unavailable") },
        log: (record) => {
          records.push(record);
        },
      },
    );
  });
});
