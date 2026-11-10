import { describe, expect, it } from "vitest";

import type { LogRecord } from "#platform/logging.ts";
import type { OutgoingEmail } from "#platform/mailer.ts";
import { ADA, type App, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { bytesOfProjectRows, seedStoredBytes, storedBytesOf } from "#testing/project-storage.ts";
import { makeOutbox } from "#testing/space-fixtures.ts";
import { makeColorToken } from "#testing/token-fixtures.ts";
import { err } from "@repo/result";

const START = new Date("2026-10-22T09:00:00Z");

const MINUTE = 60 * 1000;

const makeClock = () => {
  let instant = START;
  return {
    now: () => instant,
    at: (elapsed: number) => {
      instant = new Date(START.getTime() + elapsed);
    },
  };
};

const JUST_UNDER_FREE_ALERT = 399_999_999;

const ABOVE_FREE_ALERT = 450_000_000;

const storageAlertsOf = (sent: readonly OutgoingEmail[]) =>
  sent.filter(({ subject }) => subject.includes("stockage"));

const RED = { colorSpace: "srgb", components: [0.8, 0.1, 0.1], alpha: 1, hex: "#cc1a1a" };

const writeTokens = async (
  app: App,
  {
    accessToken,
    projectId,
    tokens,
  }: { readonly accessToken: string; readonly projectId: string; readonly tokens: unknown },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "write_tokens", arguments: { projectId, tokens } },
  });
  const { result } = await response.json();
  return result.structuredContent;
};

describe("le compteur d'un projet suit les propositions et les lots de write_tokens (ADR 0032 §1 à §3)", () => {
  it("deux propositions comptent avec leur lot", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);

      const written = await writeTokens(app, {
        ...seeded,
        tokens: [makeColorToken(), makeColorToken({ name: "couleur.fond.second" })],
      });

      expect(written.proposals).toHaveLength(2);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("le remplacement d'une proposition en attente garde le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await writeTokens(app, { ...seeded, tokens: [makeColorToken()] });

      const written = await writeTokens(app, {
        ...seeded,
        tokens: [makeColorToken({ $value: RED })],
      });

      expect(written.replaced).toHaveLength(1);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("la clôture d'un lot expiré et l'ouverture d'un autre gardent le compteur exact", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        const first = await writeTokens(app, { ...seeded, tokens: [makeColorToken()] });
        clock.at(30 * MINUTE);

        const second = await writeTokens(app, {
          ...seeded,
          tokens: [makeColorToken({ name: "couleur.fond.second" })],
        });

        expect(second.batch.id).not.toBe(first.batch.id);
        expect(await storedBytesOf(db, seeded.projectId)).toBe(
          await bytesOfProjectRows(db, seeded.projectId),
        );
      },
      { clock: clock.now },
    );
  });

  it("un write_tokens refusé ne compte que son entrée d'historique", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);

      await writeTokens(app, { ...seeded, tokens: [{ name: "sans.type" }] });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));
});

describe("un write_tokens qui porte l'espace à 80 % prévient ses propriétaires (ADR 0006 §4, ADR 0032 §4)", () => {
  it("le write_tokens qui franchit 80 % réussit et envoie l'alerte à la propriétaire", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const written = await writeTokens(app, { ...seeded, tokens: [makeColorToken()] });

        expect(written.proposals).toHaveLength(1);
        expect(storageAlertsOf(outbox.sent).map(({ to }) => to)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("le write_tokens qui franchit 80 % réussit même si le SMTP est en panne, et journalise l'échec", () => {
    const records: LogRecord[] = [];
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: JUST_UNDER_FREE_ALERT });

        const written = await writeTokens(app, { ...seeded, tokens: [makeColorToken()] });

        expect(written.proposals).toHaveLength(1);
        expect(records).toContainEqual(
          expect.objectContaining({ msg: "storage_alert_unsent", to: ADA.email }),
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

  it("un write_tokens sans changement sur un espace déjà au-dessus de 80 % et jamais alerté l'alerte", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const seeded = await seedProject(app, db);
        await writeTokens(app, { ...seeded, tokens: [makeColorToken()] });
        await seedStoredBytes(db, { projectId: seeded.projectId, bytes: ABOVE_FREE_ALERT });

        const written = await writeTokens(app, { ...seeded, tokens: [makeColorToken()] });

        expect(written.unchanged).toEqual([makeColorToken().name]);
        expect(storageAlertsOf(outbox.sent).map(({ to }) => to)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });
});
