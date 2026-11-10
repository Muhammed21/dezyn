import { describe, expect, it } from "vitest";

import { purgeNoticeOf } from "../purge-notice.ts";

const makePurgedProject = ({
  name = "Site vitrine",
  deletedEntries = 2,
  purgedBefore = new Date("2026-11-10T08:00:00.000Z"),
}: {
  readonly name?: string;
  readonly deletedEntries?: number;
  readonly purgedBefore?: Date;
} = {}) => ({ name, deletedEntries, purgedBefore });

const makeNotice = ({
  plan = "team",
  storedBytes = 448_000_000,
  projects = [makePurgedProject()],
}: {
  readonly plan?: "free" | "team";
  readonly storedBytes?: number;
  readonly projects?: readonly ReturnType<typeof makePurgedProject>[];
} = {}) => ({ spaceName: "Studio Ada", plan, storedBytes, projects });

describe("l'email de purge de l'historique (ADR 0042 §5)", () => {
  it("nomme l'espace dans son sujet", () => {
    expect(purgeNoticeOf(makeNotice()).subject).toBe(
      "L'historique de l'espace « Studio Ada » a été purgé sur dezyn",
    );
  });

  it("donne, pour chaque projet purgé, le nombre d'entrées supprimées et la date de la plus récente", () => {
    const { text } = purgeNoticeOf(
      makeNotice({
        projects: [
          makePurgedProject({
            name: "Site vitrine",
            deletedEntries: 1,
            purgedBefore: new Date("2026-03-01T23:30:00.000Z"),
          }),
          makePurgedProject({
            name: "Application mobile",
            deletedEntries: 500,
            purgedBefore: new Date("2026-11-10T00:00:00.000Z"),
          }),
        ],
      }),
    );

    expect(text).toContain(
      "« Site vitrine » : 1 entrée supprimée, la plus récente du 1 mars 2026.\n« Application mobile » : 500 entrées supprimées, la plus récente du 10 novembre 2026.",
    );
  });

  it("donne le stockage de l'espace après la purge et sa limite", () => {
    expect(purgeNoticeOf(makeNotice({ plan: "free", storedBytes: 448_999_999 })).text).toContain(
      "L'espace « Studio Ada » utilise maintenant 448 Mo sur 500 Mo.",
    );
    expect(purgeNoticeOf(makeNotice({ plan: "team", storedBytes: 18_050_000_000 })).text).toContain(
      "L'espace « Studio Ada » utilise maintenant 18 Go sur 20 Go.",
    );
  });

  it("propose le plan Team à un espace Free", () => {
    expect(purgeNoticeOf(makeNotice({ plan: "free" })).text).toMatch(
      /Le plan Team offre 20 Go de stockage\.$/,
    );
  });

  it("ne propose pas le plan Team à un espace Team", () => {
    expect(purgeNoticeOf(makeNotice({ plan: "team", storedBytes: 18_050_000_000 })).text).toMatch(
      /\n\nL'espace « Studio Ada » utilise maintenant 18 Go sur 20 Go\.$/,
    );
  });

  it("explique ce que la purge a supprimé", () => {
    expect(purgeNoticeOf(makeNotice()).text).toMatch(
      /^L'espace « Studio Ada » a atteint sa limite de stockage : dezyn a supprimé les plus anciennes entrées de l'historique de ses projets\.\n\n/,
    );
  });
});
