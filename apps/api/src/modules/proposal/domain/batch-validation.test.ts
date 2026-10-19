import { describe, expect, it } from "vitest";

import type { TokenDefinition } from "../../token/contracts/token-definition.ts";
import { planBatchValidation } from "./batch-validation.ts";
import type { Proposition } from "./proposition.ts";

type ColorValue = NonNullable<Extract<TokenDefinition, { $type: "color" }>["$value"]>;

const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8] } satisfies ColorValue;

const makeProposition = ({
  id,
  name = `couleur.${id}`,
  value = PRIMARY_BLUE,
  modes,
  status = "proposed",
}: {
  readonly id: string;
  readonly name?: string;
  readonly value?: ColorValue;
  readonly modes?: Readonly<Record<string, ColorValue>>;
  readonly status?: Proposition["status"];
}): Proposition => ({
  id,
  lotId: "lot",
  name,
  kind: "create",
  token:
    modes === undefined ? { name, $type: "color", $value: value } : { name, $type: "color", modes },
  status,
  createdAt: new Date("2026-10-19T09:00:00Z"),
});

const idsOf = (propositions: readonly Proposition[]) => propositions.map(({ id }) => id);

describe("seul un lot fermé se valide en entier (ADR 0013 §4)", () => {
  it("un lot ouvert ne se valide pas", () => {
    expect(
      planBatchValidation({
        lotState: "open",
        propositions: [makeProposition({ id: "a" })],
        rejected: [],
      }),
    ).toEqual({ refusal: "batch_open" });
  });

  it("un lot fermé valide toutes ses propositions Proposées, sauf celles rejetées", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "a" }),
        makeProposition({ id: "b" }),
        makeProposition({ id: "c" }),
      ],
      rejected: ["b"],
    });

    expect(plan).toMatchObject({ toReject: [{ id: "b" }] });
    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["a", "c"]);
  });

  it("une proposition qui n'est plus Proposée n'est ni validée ni rejetée (ADR 0013 §9)", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "a", status: "replaced" }),
        makeProposition({ id: "b", status: "validated" }),
        makeProposition({ id: "c", status: "rejected" }),
        makeProposition({ id: "d" }),
      ],
      rejected: ["a", "c"],
    });

    expect(plan).toEqual({ toValidate: [expect.objectContaining({ id: "d" })], toReject: [] });
  });

  it("un rejet qui désigne une proposition hors du lot refuse la validation", () => {
    expect(
      planBatchValidation({
        lotState: "closed",
        propositions: [makeProposition({ id: "a" })],
        rejected: ["a", "z", "y"],
      }),
    ).toEqual({ refusal: "unknown_propositions", ids: ["z", "y"] });
  });
});

describe("un token se valide après les tokens du lot qu'il référence", () => {
  it("une référence écrite avant sa cible se valide après elle", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "fond", value: "{couleur.bleu}" }),
        makeProposition({ id: "bleu", name: "couleur.bleu" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["bleu", "fond"]);
  });

  it("une référence par mode compte aussi", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "fond", modes: { clair: PRIMARY_BLUE, sombre: "{couleur.nuit}" } }),
        makeProposition({ id: "nuit", name: "couleur.nuit" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["nuit", "fond"]);
  });

  it("une chaîne de références se valide depuis sa racine, et le reste garde l'ordre d'écriture", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "bouton", value: "{couleur.fond}" }),
        makeProposition({ id: "seul" }),
        makeProposition({ id: "fond", name: "couleur.fond", value: "{couleur.bleu}" }),
        makeProposition({ id: "bleu", name: "couleur.bleu" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual([
      "seul",
      "bleu",
      "fond",
      "bouton",
    ]);
  });

  it("une référence vers un token hors du lot ne change pas l'ordre", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "fond", value: "{couleur.validee}" }),
        makeProposition({ id: "bleu" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["fond", "bleu"]);
  });

  it("des références en boucle gardent l'ordre d'écriture", () => {
    const plan = planBatchValidation({
      lotState: "closed",
      propositions: [
        makeProposition({ id: "a", name: "couleur.a", value: "{couleur.b}" }),
        makeProposition({ id: "b", name: "couleur.b", value: "{couleur.a}" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["a", "b"]);
  });
});
