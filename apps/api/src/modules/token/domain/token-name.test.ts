import { describe, expect, it } from "vitest";

import { tokenNameRefusal } from "./token-name.ts";

describe("un nom de token est un chemin de groupes au sens DTCG (ADR 0010 §1)", () => {
  it("accepte un chemin de segments séparés par des points", () => {
    expect(tokenNameRefusal("couleur.fond.primaire")).toBeUndefined();
  });

  it.each([[""], ["couleur..primaire"], [".couleur"], ["couleur."]])(
    "refuse %j, qui a un segment vide",
    (name) => {
      expect(tokenNameRefusal(name)).toBe("empty_segment");
    },
  );

  it.each([["$couleur.primaire"], ["couleur.$primaire"]])(
    "refuse %j, dont un segment commence par $",
    (name) => {
      expect(tokenNameRefusal(name)).toBe("dollar_prefix");
    },
  );

  it.each([["couleur.{primaire"], ["couleur.primaire}"], ["{couleur.primaire}"]])(
    "refuse %j, qui contient une accolade réservée aux références",
    (name) => {
      expect(tokenNameRefusal(name)).toBe("brace");
    },
  );

  it("accepte un $ ailleurs qu'en tête de segment", () => {
    expect(tokenNameRefusal("prix.en$")).toBeUndefined();
  });
});
