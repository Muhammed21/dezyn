import { describe, expect, it } from "vitest";

import { duplicatesOf } from "./duplicates.ts";

const BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8] };

const NIGHT = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const makeColor = ({ name, $value = BLUE }: { name: string; $value?: unknown }) => ({
  name,
  $type: "color",
  $value,
});

const makeThemedColor = ({ name, modes }: { name: string; modes: Record<string, unknown> }) => ({
  name,
  $type: "color",
  modes,
});

describe("dezyn signale les tokens de même valeur dans le projet (CONTEXT.md : doublon)", () => {
  it("deux tokens de même type et de même valeur sont doublons l'un de l'autre", () => {
    const fond = makeColor({ name: "couleur.fond" });

    expect(
      duplicatesOf({ token: fond, among: [fond, makeColor({ name: "couleur.bord" })] }),
    ).toEqual(["couleur.bord"]);
  });

  it("une valeur différente n'est pas un doublon", () => {
    const fond = makeColor({ name: "couleur.fond" });
    const tokens = [fond, makeColor({ name: "couleur.bord", $value: NIGHT })];

    expect(duplicatesOf({ token: fond, among: tokens })).toEqual([]);
  });

  it("deux tokens de types différents ne sont pas doublons, même de valeur identique", () => {
    const espace = { name: "espace.petit", $type: "dimension", $value: { value: 4, unit: "px" } };
    const tokens = [
      espace,
      { name: "rayon.petit", $type: "radius", $value: { value: 4, unit: "px" } },
    ];

    expect(duplicatesOf({ token: espace, among: tokens })).toEqual([]);
  });

  it("sur un projet à modes, la valeur doit être identique dans chaque mode", () => {
    const fond = makeThemedColor({ name: "couleur.fond", modes: { clair: BLUE, sombre: NIGHT } });
    const tokens = [
      fond,
      makeThemedColor({ name: "couleur.bord", modes: { clair: BLUE, sombre: NIGHT } }),
      makeThemedColor({ name: "couleur.texte", modes: { clair: BLUE, sombre: BLUE } }),
    ];

    expect(duplicatesOf({ token: fond, among: tokens })).toEqual(["couleur.bord"]);
  });

  it("un token qui référence un autre token n'est pas un doublon", () => {
    const lien = makeColor({ name: "couleur.lien", $value: "{couleur.marque}" });
    const tokens = [
      makeColor({ name: "couleur.marque" }),
      lien,
      makeColor({ name: "couleur.titre", $value: "{couleur.marque}" }),
    ];

    expect(duplicatesOf({ token: lien, among: tokens })).toEqual([]);
  });

  it("une référence dans un seul mode suffit à écarter le token", () => {
    const fond = makeThemedColor({
      name: "couleur.fond",
      modes: { clair: "{couleur.marque}", sombre: NIGHT },
    });
    const tokens = [
      fond,
      makeThemedColor({
        name: "couleur.bord",
        modes: { clair: "{couleur.marque}", sombre: NIGHT },
      }),
    ];

    expect(duplicatesOf({ token: fond, among: tokens })).toEqual([]);
  });

  it("un token peut avoir plusieurs doublons", () => {
    const fond = makeColor({ name: "couleur.fond" });
    const tokens = [
      fond,
      makeColor({ name: "couleur.bord" }),
      makeColor({ name: "couleur.cadre" }),
    ];

    expect(duplicatesOf({ token: fond, among: tokens })).toEqual(["couleur.bord", "couleur.cadre"]);
  });

  it("la description ne compte pas dans la comparaison", () => {
    const fond = { ...makeColor({ name: "couleur.fond" }), $description: "Fond des pages" };
    const tokens = [
      fond,
      { ...makeColor({ name: "couleur.bord" }), $description: "Bord des cartes" },
    ];

    expect(duplicatesOf({ token: fond, among: tokens })).toEqual(["couleur.bord"]);
  });
});
