import { describe, expect, it } from "vitest";

import type { TokenDefinition } from "../../token/contracts/token-definition.ts";
import { planBatchValidation } from "./batch-validation.ts";
import type { Proposal } from "./proposal.ts";

type ColorValue = NonNullable<Extract<TokenDefinition, { $type: "color" }>["$value"]>;

const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8] } satisfies ColorValue;

const makeProposal = ({
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
  readonly status?: Proposal["status"];
}): Proposal => ({
  id,
  batchId: "lot",
  name,
  kind: "create",
  token:
    modes === undefined ? { name, $type: "color", $value: value } : { name, $type: "color", modes },
  status,
  createdAt: new Date("2026-10-19T09:00:00Z"),
});

const idsOf = (proposals: readonly Proposal[]) => proposals.map(({ id }) => id);

describe("seul un lot fermé se valide en entier (ADR 0013 §4)", () => {
  it("un lot ouvert ne se valide pas", () => {
    expect(
      planBatchValidation({
        batchState: "open",
        proposals: [makeProposal({ id: "a" })],
        rejected: [],
      }),
    ).toEqual({ refusal: "batch_open" });
  });

  it("un lot fermé valide toutes ses propositions Proposées, sauf celles rejetées", () => {
    const plan = planBatchValidation({
      batchState: "closed",
      proposals: [makeProposal({ id: "a" }), makeProposal({ id: "b" }), makeProposal({ id: "c" })],
      rejected: ["b"],
    });

    expect(plan).toMatchObject({ toReject: [{ id: "b" }] });
    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["a", "c"]);
  });

  it("une proposition qui n'est plus Proposée n'est ni validée ni rejetée (ADR 0013 §9)", () => {
    const plan = planBatchValidation({
      batchState: "closed",
      proposals: [
        makeProposal({ id: "a", status: "replaced" }),
        makeProposal({ id: "b", status: "validated" }),
        makeProposal({ id: "c", status: "rejected" }),
        makeProposal({ id: "d" }),
      ],
      rejected: ["a", "c"],
    });

    expect(plan).toEqual({ toValidate: [expect.objectContaining({ id: "d" })], toReject: [] });
  });

  it("un rejet qui désigne une proposition hors du lot refuse la validation", () => {
    expect(
      planBatchValidation({
        batchState: "closed",
        proposals: [makeProposal({ id: "a" })],
        rejected: ["a", "z", "y"],
      }),
    ).toEqual({ refusal: "unknown_propositions", ids: ["z", "y"] });
  });
});

describe("un token se valide après les tokens du lot qu'il référence", () => {
  it("une référence écrite avant sa cible se valide après elle", () => {
    const plan = planBatchValidation({
      batchState: "closed",
      proposals: [
        makeProposal({ id: "fond", value: "{couleur.bleu}" }),
        makeProposal({ id: "bleu", name: "couleur.bleu" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["bleu", "fond"]);
  });

  it("une référence par mode compte aussi", () => {
    const plan = planBatchValidation({
      batchState: "closed",
      proposals: [
        makeProposal({ id: "fond", modes: { clair: PRIMARY_BLUE, sombre: "{couleur.nuit}" } }),
        makeProposal({ id: "nuit", name: "couleur.nuit" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["nuit", "fond"]);
  });

  it("une chaîne de références se valide depuis sa racine, et le reste garde l'ordre d'écriture", () => {
    const plan = planBatchValidation({
      batchState: "closed",
      proposals: [
        makeProposal({ id: "bouton", value: "{couleur.fond}" }),
        makeProposal({ id: "seul" }),
        makeProposal({ id: "fond", name: "couleur.fond", value: "{couleur.bleu}" }),
        makeProposal({ id: "bleu", name: "couleur.bleu" }),
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
      batchState: "closed",
      proposals: [
        makeProposal({ id: "fond", value: "{couleur.validee}" }),
        makeProposal({ id: "bleu" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["fond", "bleu"]);
  });

  it("des références en boucle gardent l'ordre d'écriture", () => {
    const plan = planBatchValidation({
      batchState: "closed",
      proposals: [
        makeProposal({ id: "a", name: "couleur.a", value: "{couleur.b}" }),
        makeProposal({ id: "b", name: "couleur.b", value: "{couleur.a}" }),
      ],
      rejected: [],
    });

    expect("toValidate" in plan && idsOf(plan.toValidate)).toEqual(["a", "b"]);
  });
});
