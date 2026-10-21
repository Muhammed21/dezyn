import { describe, expect, it } from "vitest";

import { fieldAliases } from "./field-references.ts";

describe("les références de champ d'une valeur composée (ADR 0029 §1)", () => {
  it("une couche d'ombre seule rend chaque champ alias avec le type attendu", () => {
    expect(
      fieldAliases({
        $type: "shadow",
        value: { color: "{couleur.ombre}", blur: "{flou.carte}", inset: true },
      }),
    ).toEqual([
      { field: "color", name: "couleur.ombre", $type: "color" },
      { field: "blur", name: "flou.carte", $type: "dimension" },
    ]);
  });

  it("une ombre multicouche préfixe chaque champ par sa couche", () => {
    expect(
      fieldAliases({
        $type: "shadow",
        value: [{ spread: "{taille.etalement}" }, { color: "{couleur.ombre}" }],
      }),
    ).toEqual([
      { field: "0.spread", name: "taille.etalement", $type: "dimension" },
      { field: "1.color", name: "couleur.ombre", $type: "color" },
    ]);
  });

  it("un dégradé préfixe chaque champ par son arrêt", () => {
    expect(
      fieldAliases({
        $type: "gradient",
        value: [{ color: "{couleur.marque}", position: 0 }, { position: "{nombre.milieu}" }],
      }),
    ).toEqual([
      { field: "0.color", name: "couleur.marque", $type: "color" },
      { field: "1.position", name: "nombre.milieu", $type: "number" },
    ]);
  });

  it("une couche qui n'est pas un objet ne porte aucune référence", () => {
    expect(
      fieldAliases({
        $type: "shadow",
        value: [null, "{couleur.ombre}", { color: "{couleur.ombre}" }],
      }),
    ).toEqual([{ field: "2.color", name: "couleur.ombre", $type: "color" }]);
  });

  it("un alias dans un champ que le type ne connaît pas n'est pas une référence", () => {
    expect(
      fieldAliases({ $type: "typography", value: { fontSize: "{taille.corps}", ombre: "{x.y}" } }),
    ).toEqual([{ field: "fontSize", name: "taille.corps", $type: "dimension" }]);
  });

  it.each([
    ["une valeur alias entière", "{ombre.carte}"],
    ["une valeur nulle", null],
  ])("%s ne porte aucune référence de champ", (_case, value) => {
    expect(fieldAliases({ $type: "shadow", value })).toEqual([]);
  });
});
