import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./history-cursor.ts";

const POSITION = {
  occurredAt: new Date("2026-10-18T12:00:00.123Z"),
  id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
};

const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("le curseur de l'historique est opaque et vérifié (ADR 0004 §3)", () => {
  it("un curseur rendu par le serveur se relit à la même position", () => {
    expect(decodeCursor(encodeCursor(POSITION))).toEqual(POSITION);
  });

  it("le curseur ne contient que des caractères base64url", () => {
    expect(encodeCursor(POSITION)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["du texte qui n'est pas du JSON", Buffer.from("pas du json").toString("base64url")],
    ["une date invalide", encoded({ occurredAt: "hier", id: POSITION.id })],
    [
      "un identifiant qui n'est pas un UUID",
      encoded({ occurredAt: POSITION.occurredAt, id: "entree-1" }),
    ],
    ["un champ manquant", encoded({ id: POSITION.id })],
    ["des caractères hors base64url", "pas un curseur !"],
    ["un curseur valide suivi d'un caractère hors base64url", `${encodeCursor(POSITION)}!`],
    ["un curseur valide précédé d'un caractère hors base64url", `!${encodeCursor(POSITION)}`],
  ])("refuse %s", (_, cursor) => {
    expect(decodeCursor(cursor)).toBeUndefined();
  });
});
