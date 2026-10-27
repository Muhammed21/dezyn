import { describe, expect, it } from "vitest";

import { groupConflict, tokenNameRefusal } from "./token-name.ts";

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

describe("un nom de token n'est jamais le groupe d'un autre (ADR 0039 §1)", () => {
  it("un nom qui est le groupe d'un autre token est en conflit avec lui", () => {
    expect(groupConflict("couleur", ["taille.base", "couleur.fond"])).toBe("couleur.fond");
  });

  it("un nom dont un groupe est un autre token est en conflit avec lui", () => {
    expect(groupConflict("couleur.fond.primaire", ["couleur"])).toBe("couleur");
  });

  it("un groupe plus haut compte aussi", () => {
    expect(groupConflict("couleur", ["couleur.fond.primaire"])).toBe("couleur.fond.primaire");
  });

  it("le début d'un segment n'est pas un groupe", () => {
    expect(groupConflict("couleur.fondu", ["couleur.fond"])).toBeUndefined();
    expect(groupConflict("couleur.fond", ["couleur.fondu"])).toBeUndefined();
  });

  it("un nom identique n'est pas un conflit de groupe", () => {
    expect(groupConflict("couleur.fond", ["couleur.fond"])).toBeUndefined();
  });

  it("un nom sans autre token n'est en conflit avec rien", () => {
    expect(groupConflict("couleur.fond", [])).toBeUndefined();
  });

  it("nomme le premier conflit dans l'ordre des autres noms", () => {
    expect(groupConflict("couleur", ["couleur.fond", "couleur.bord"])).toBe("couleur.fond");
  });
});
