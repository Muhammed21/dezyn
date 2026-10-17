import { describe, expect, it } from "vitest";

import { latestMigration } from "./latest-migration.ts";

const makeEntry = ({ tag, when }: { readonly tag: string; readonly when: number }) => ({
  idx: 0,
  version: "7",
  when,
  tag,
  breakpoints: true,
});

describe("latestMigration", () => {
  it("donne la migration la plus récente du journal, quel que soit l'ordre des entrées", () => {
    const journal = {
      entries: [
        makeEntry({ tag: "0001_espaces", when: 1_792_300_000_000 }),
        makeEntry({ tag: "0002_historique", when: 1_792_400_000_000 }),
        makeEntry({ tag: "0000_socle", when: 1_792_200_000_000 }),
      ],
    };

    expect(latestMigration(journal)).toEqual({ tag: "0002_historique", when: 1_792_400_000_000 });
  });

  it("refuse un journal sans migration", () => {
    expect(() => latestMigration({ entries: [] })).toThrow(
      "Aucune migration dans le journal Drizzle",
    );
  });
});
