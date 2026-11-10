import { describe, expect, it } from "vitest";

import type { LogRecord } from "#platform/logging.ts";
import type { OutgoingEmail } from "#platform/mailer.ts";
import { ok } from "@repo/result";

import { notifyPurge, type PurgeNotices } from "../notify-purge.ts";

const makePurgedSpace = () => ({
  spaceId: "espace-ada",
  name: "Studio Ada",
  projects: [
    {
      projectId: "projet-site",
      name: "Site vitrine",
      deletedEntries: 2,
      purgedBefore: new Date("2026-11-10T08:00:00.000Z"),
    },
  ],
});

const unreadableNotices: PurgeNotices = {
  recipientsOf: async () => {
    throw new Error("connexion perdue");
  },
};

describe("la notification d'un espace purgé ne fait jamais échouer le passage", () => {
  it("journalise l'espace dont les destinataires ne se lisent pas, sans rejeter", async () => {
    const sent: OutgoingEmail[] = [];
    const records: LogRecord[] = [];
    const notify = notifyPurge({
      notices: unreadableNotices,
      mailer: {
        send: async (email) => {
          sent.push(email);
          return ok(undefined);
        },
      },
      log: (record) => records.push(record),
    });

    await expect(notify(makePurgedSpace())).resolves.toBeUndefined();

    expect(sent).toEqual([]);
    expect(records).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "history_purge_notice_failed",
        spaceId: "espace-ada",
        error: "connexion perdue",
      }),
    ]);
  });
});
