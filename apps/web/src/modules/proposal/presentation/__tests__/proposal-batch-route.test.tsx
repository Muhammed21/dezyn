import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { err, ok, type Result } from "@repo/result";

import type {
  Batch,
  BatchSummary,
  BatchValidationFailure,
  Decision,
  Proposal,
  ProposalFailure,
  ReviewedProposal,
  ReviewFailure,
  ValidatedBatch,
} from "../../domain/proposal.ts";
import { projectProposals } from "../project-proposals.tsx";
import { proposalBatchRoute } from "../proposal-batch-route.tsx";

const BATCH_ID = "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_BATCH_ID = "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PROJECT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.1, 0.4, 0.9] };
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

type ReadBatch = (batch: { readonly batchId: string }) => Promise<Result<Batch, ProposalFailure>>;

type ReviewProposal = (review: {
  readonly proposalId: string;
  readonly decision: Decision;
}) => Promise<Result<ReviewedProposal, ReviewFailure>>;

type ListBatches = (project: {
  readonly projectId: string;
}) => Promise<Result<readonly BatchSummary[], ProposalFailure>>;

type ValidateBatch = (validation: {
  readonly batchId: string;
  readonly rejected: readonly string[];
}) => Promise<Result<ValidatedBatch, BatchValidationFailure>>;

type Review = {
  readonly reviewProposal?: ReviewProposal;
  readonly validateBatch?: ValidateBatch;
  readonly onReviewed?: (project: { readonly projectId: string }) => Promise<unknown>;
  readonly listBatches?: ListBatches;
};

const makeProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "couleur.fond.primaire",
  kind: "create",
  status: "proposed",
  validated: undefined,
  proposed: { $type: "color", $value: PRIMARY_BLUE },
  ...overrides,
});

const makeBatch = (overrides: Partial<Batch> = {}): Batch => ({
  id: BATCH_ID,
  projectId: PROJECT_ID,
  intent: "Palette de la marque",
  state: "closed",
  proposals: [makeProposal()],
  ...overrides,
});

const reading =
  (batch: Batch): ReadBatch =>
  () =>
    Promise.resolve(ok(batch));

const renderBatch = async (
  readBatch: ReadBatch,
  {
    reviewProposal = () => new Promise(() => {}),
    validateBatch = () => new Promise(() => {}),
    onReviewed = () => Promise.resolve(),
    listBatches,
  }: Review = {},
) => {
  const ProjectProposals =
    listBatches === undefined ? undefined : projectProposals({ listBatches });
  const root = createRootRoute({
    component: () => (
      <>
        <Outlet />
        {ProjectProposals === undefined ? null : <ProjectProposals projectId={PROJECT_ID} />}
      </>
    ),
  });
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
  });
  const history = createMemoryHistory({ initialEntries: [`/lots/${BATCH_ID}`] });
  const router = createRouter({
    routeTree: root.addChildren([
      proposalBatchRoute({ parent: root, readBatch, reviewProposal, validateBatch, onReviewed }),
      signIn,
    ]),
    history,
  });
  return {
    history,
    screen: await render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
};

type Screen = Awaited<ReturnType<typeof renderBatch>>["screen"];

const proposalList = (screen: Screen) => screen.getByRole("list", { name: "Propositions du lot" });

const proposalItems = (screen: Screen) => proposalList(screen).getByRole("listitem");

describe("page d'un lot de propositions (ADR 0012 §1, ADR 0044 §6)", () => {
  it("montre l'intention et l'état du lot, et mène aux tokens de son projet", async () => {
    const asked: string[] = [];
    const { screen } = await renderBatch(({ batchId }) => {
      asked.push(batchId);
      return reading(makeBatch())({ batchId });
    });

    await expect
      .element(screen.getByRole("heading", { name: "Palette de la marque" }))
      .toBeVisible();
    await expect.element(screen.getByText("Fermé", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Tokens du projet" }))
      .toHaveAttribute("href", `/projets/${PROJECT_ID}`);
    expect(asked).toEqual([BATCH_ID]);
  });

  it.each([
    ["Sans intention", { intent: undefined }],
    ["Ouvert", { state: "open" }],
    ["état inconnu", { state: "unknown" }],
  ] as const)("nomme %s", async (text, overrides) => {
    const { screen } = await renderBatch(reading(makeBatch(overrides)));

    await expect.element(screen.getByText(text, { exact: true })).toBeVisible();
  });

  it("liste les propositions dans l'ordre de l'API, avec leur nom, leur nature, leur statut et leurs valeurs", async () => {
    const update = makeProposal({
      id: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      name: "couleur.bleu.500",
      kind: "update",
      status: "validated",
      validated: { $type: "color", $value: PRIMARY_BLUE },
      proposed: { $type: "color", $value: NIGHT_BLUE },
    });
    const { screen } = await renderBatch(
      reading(makeBatch({ proposals: [makeProposal(), update] })),
    );

    const creation = proposalItems(screen).nth(0);
    await expect.element(creation).toHaveTextContent("couleur.fond.primaire");
    await expect.element(creation.getByText("Création", { exact: true })).toBeVisible();
    await expect.element(creation.getByText("Proposée", { exact: true })).toBeVisible();
    await expect
      .element(creation)
      .toHaveTextContent(`Proposée : ${JSON.stringify({ $type: "color", $value: PRIMARY_BLUE })}`);
    await expect.element(creation.getByText("Aucune valeur validée")).toBeVisible();
    const modification = proposalItems(screen).nth(1);
    await expect.element(modification).toHaveTextContent("couleur.bleu.500");
    await expect.element(modification.getByText("Modification", { exact: true })).toBeVisible();
    await expect.element(modification.getByText("Validée", { exact: true })).toBeVisible();
    await expect
      .element(modification)
      .toHaveTextContent(`Proposée : ${JSON.stringify({ $type: "color", $value: NIGHT_BLUE })}`);
    await expect
      .element(modification)
      .toHaveTextContent(`Validée : ${JSON.stringify({ $type: "color", $value: PRIMARY_BLUE })}`);
    expect(proposalItems(screen).elements()).toHaveLength(2);
  });

  it.each([
    ["Rejetée", { status: "rejected" }],
    ["Remplacée", { status: "replaced" }],
    ["statut inconnu", { status: "unknown" }],
    ["nature inconnue", { kind: "unknown" }],
  ] as const)("nomme %s", async (text, overrides) => {
    const { screen } = await renderBatch(
      reading(makeBatch({ proposals: [makeProposal(overrides)] })),
    );

    await expect
      .element(proposalItems(screen).nth(0).getByText(text, { exact: true }))
      .toBeVisible();
  });

  it("relit chaque lot : d'un lot à l'autre, les propositions changent", async () => {
    const { screen, history } = await renderBatch(({ batchId }) =>
      reading(makeBatch({ proposals: [makeProposal({ name: `token.du.lot.${batchId}` })] }))({
        batchId,
      }),
    );
    await expect
      .element(proposalItems(screen).nth(0))
      .toHaveTextContent(`token.du.lot.${BATCH_ID}`);

    history.push(`/lots/${OTHER_BATCH_ID}`);

    await expect
      .element(proposalItems(screen).nth(0))
      .toHaveTextContent(`token.du.lot.${OTHER_BATCH_ID}`);
  });

  it("annonce le chargement du lot", async () => {
    const { screen } = await renderBatch(() => new Promise(() => {}));

    await expect.element(screen.getByText("Chargement du lot…")).toBeVisible();
  });

  it("renvoie vers la connexion quand le membre n'a pas de session", async () => {
    const { screen } = await renderBatch(() => Promise.resolve(err("unauthenticated")));

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });

  it.each([
    ["not_found", "Ce lot est introuvable."],
    ["unavailable", "Ce lot est indisponible pour le moment."],
    ["invalid_response", "Ce lot est indisponible pour le moment."],
  ] as const)("annonce l'échec %s de la lecture", async (failure, message) => {
    const { screen } = await renderBatch(() => Promise.resolve(err(failure)));

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("list").elements()).toHaveLength(0);
  });
});

const reviewedAs =
  (status: ReviewedProposal["status"]): ReviewProposal =>
  ({ proposalId }) =>
    Promise.resolve(ok({ id: proposalId, name: "couleur.fond.primaire", kind: "create", status }));

const readingInTurn = (...batches: readonly Batch[]) => {
  const reads = { count: 0 };
  const readBatch: ReadBatch = () => {
    const batch = batches[Math.min(reads.count, batches.length - 1)] ?? makeBatch();
    reads.count += 1;
    return Promise.resolve(ok(batch));
  };
  return { readBatch, reads };
};

describe("relecture d'une proposition depuis la page du lot (ADR 0012 §1, ADR 0044 §6)", () => {
  it("ne propose Valider et Rejeter que pour les propositions Proposées", async () => {
    const { screen } = await renderBatch(
      reading(
        makeBatch({
          proposals: [
            makeProposal(),
            makeProposal({ id: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", status: "validated" }),
            makeProposal({ id: "4f8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", status: "rejected" }),
            makeProposal({ id: "5a8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", status: "replaced" }),
            makeProposal({ id: "6b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", status: "unknown" }),
          ],
        }),
      ),
    );

    await expect
      .element(proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }))
      .toBeVisible();
    await expect
      .element(proposalItems(screen).nth(0).getByRole("button", { name: "Rejeter" }))
      .toBeVisible();
    expect(proposalList(screen).getByRole("button").elements()).toHaveLength(2);
  });

  it.each([
    ["Valider", "validate"],
    ["Rejeter", "reject"],
  ] as const)("%s envoie la décision %s pour cette proposition", async (button, decision) => {
    const sent: { proposalId: string; decision: Decision }[] = [];
    const { screen } = await renderBatch(reading(makeBatch()), {
      reviewProposal: (review) => {
        sent.push(review);
        return reviewedAs("validated")(review);
      },
    });

    await proposalItems(screen).nth(0).getByRole("button", { name: button }).click();

    await expect.poll(() => sent).toEqual([{ proposalId: makeProposal().id, decision }]);
  });

  it("désactive les boutons de la proposition pendant l'envoi", async () => {
    const { screen } = await renderBatch(reading(makeBatch()));

    await proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }).click();

    await expect
      .element(proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }))
      .toBeDisabled();
    await expect
      .element(proposalItems(screen).nth(0).getByRole("button", { name: "Rejeter" }))
      .toBeDisabled();
  });

  it("après une validation, relit le lot, les lots du projet et les tokens du projet", async () => {
    const { readBatch, reads } = readingInTurn(
      makeBatch(),
      makeBatch({ proposals: [makeProposal({ status: "validated" })] }),
    );
    const reviewed: string[] = [];
    const listed = { count: 0 };
    const { screen } = await renderBatch(readBatch, {
      reviewProposal: reviewedAs("validated"),
      onReviewed: ({ projectId }) => {
        reviewed.push(projectId);
        return Promise.resolve();
      },
      listBatches: () => {
        listed.count += 1;
        return Promise.resolve(
          ok([{ id: BATCH_ID, intent: "Palette", state: "closed", toReview: 2 - listed.count }]),
        );
      },
    });
    await expect.element(screen.getByText("1 à relire")).toBeVisible();

    await proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }).click();

    await expect
      .element(proposalItems(screen).nth(0).getByText("Validée", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("0 à relire")).toBeVisible();
    expect(screen.getByRole("button").elements()).toHaveLength(0);
    expect(reads.count).toBe(2);
    expect(reviewed).toEqual([PROJECT_ID]);
  });

  it("une proposition déjà relue l'annonce, puis relit le lot et les tokens du projet", async () => {
    const { readBatch, reads } = readingInTurn(
      makeBatch(),
      makeBatch({ proposals: [makeProposal({ status: "replaced" })] }),
    );
    const reviewed: string[] = [];
    const { screen } = await renderBatch(readBatch, {
      reviewProposal: () => Promise.resolve(err("already_reviewed")),
      onReviewed: ({ projectId }) => {
        reviewed.push(projectId);
        return Promise.resolve();
      },
    });

    await proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }).click();

    await expect
      .element(proposalItems(screen).nth(0).getByRole("alert"))
      .toHaveTextContent("Cette proposition a déjà été relue.");
    await expect
      .element(proposalItems(screen).nth(0).getByText("Remplacée", { exact: true }))
      .toBeVisible();
    expect(reads.count).toBe(2);
    expect(reviewed).toEqual([PROJECT_ID]);
  });

  it("une proposition invalide liste ses erreurs, sans relire le lot", async () => {
    const { readBatch, reads } = readingInTurn(makeBatch());
    const reviewed: string[] = [];
    const { screen } = await renderBatch(readBatch, {
      reviewProposal: () =>
        Promise.resolve(
          err({
            reason: "invalid_proposal",
            errors: [
              { path: "name", message: "Nom déjà pris dans le projet" },
              { path: "$value", message: "Référence vers un token non validé" },
            ],
          }),
        ),
      onReviewed: ({ projectId }) => {
        reviewed.push(projectId);
        return Promise.resolve();
      },
    });

    await proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }).click();

    const alert = proposalItems(screen).nth(0).getByRole("alert");
    await expect.element(alert).toHaveTextContent("Cette proposition est invalide :");
    await expect
      .element(alert.getByRole("listitem").nth(0))
      .toHaveTextContent("name : Nom déjà pris dans le projet");
    await expect
      .element(alert.getByRole("listitem").nth(1))
      .toHaveTextContent("$value : Référence vers un token non validé");
    await expect
      .element(proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }))
      .toBeEnabled();
    expect(reads.count).toBe(1);
    expect(reviewed).toEqual([]);
  });

  it("montre deux erreurs sur le même champ, sans que React confonde leurs lignes", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { screen } = await renderBatch(reading(makeBatch()), {
      reviewProposal: () =>
        Promise.resolve(
          err({
            reason: "invalid_proposal",
            errors: [
              { path: "name", message: "Nom déjà pris dans le projet" },
              { path: "name", message: "Nom en conflit de groupe avec le token couleur" },
            ],
          }),
        ),
    });

    await proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }).click();

    const alert = proposalItems(screen).nth(0).getByRole("alert");
    await expect
      .element(alert.getByRole("listitem").nth(1))
      .toHaveTextContent("name : Nom en conflit de groupe avec le token couleur");
    expect(alert.getByRole("listitem").elements()).toHaveLength(2);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    consoleError.mockRestore();
  });

  it.each([
    ["not_found", "Cette proposition est introuvable."],
    ["unavailable", "La relecture est indisponible pour le moment."],
    ["invalid_response", "La relecture est indisponible pour le moment."],
  ] as const)("annonce l'échec %s de la relecture", async (failure, message) => {
    const { screen } = await renderBatch(reading(makeBatch()), {
      reviewProposal: () => Promise.resolve(err(failure)),
    });

    await proposalItems(screen).nth(0).getByRole("button", { name: "Rejeter" }).click();

    await expect
      .element(proposalItems(screen).nth(0).getByRole("alert"))
      .toHaveTextContent(message);
  });

  it("renvoie vers la connexion quand la session expire avant la relecture", async () => {
    const { screen } = await renderBatch(reading(makeBatch()), {
      reviewProposal: () => Promise.resolve(err("unauthenticated")),
    });

    await proposalItems(screen).nth(0).getByRole("button", { name: "Valider" }).click();

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});

const SECOND_ID = "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeTwoProposedBatch = (overrides: Partial<Batch> = {}) =>
  makeBatch({
    proposals: [makeProposal(), makeProposal({ id: SECOND_ID, name: "couleur.fond.second" })],
    ...overrides,
  });

const validateBatchButton = (screen: Screen) =>
  screen.getByRole("button", { name: "Valider le lot" });

const batchValidationOutcome = (screen: Screen) =>
  screen.getByRole("region", { name: "Validation du lot" });

describe("validation d'un lot fermé depuis sa page (ADR 0013 §4, ADR 0044 §6)", () => {
  it("donne une case Rejeter dans le lot aux seules propositions Proposées, et un bouton Valider le lot", async () => {
    const { screen } = await renderBatch(
      reading(
        makeBatch({
          proposals: [makeProposal(), makeProposal({ id: SECOND_ID, status: "validated" })],
        }),
      ),
    );

    await expect.element(validateBatchButton(screen)).toBeVisible();
    await expect
      .element(proposalItems(screen).nth(0).getByRole("checkbox", { name: "Rejeter dans le lot" }))
      .not.toBeChecked();
    expect(screen.getByRole("checkbox").elements()).toHaveLength(1);
  });

  it.each([
    ["un lot ouvert", makeBatch({ state: "open" })],
    ["un lot dont l'état est inconnu", makeBatch({ state: "unknown" })],
    [
      "un lot sans proposition à relire",
      makeBatch({ proposals: [makeProposal({ status: "validated" })] }),
    ],
  ])("ne propose pas de valider %s", async (_case, batch) => {
    const { screen } = await renderBatch(reading(batch));

    await expect.element(screen.getByRole("heading")).toBeVisible();
    expect(screen.getByRole("checkbox").elements()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Valider le lot" }).elements()).toHaveLength(0);
  });

  it("envoie le lot avec les seules propositions cochées comme rejetées", async () => {
    const sent: { batchId: string; rejected: readonly string[] }[] = [];
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()), {
      validateBatch: (validation) => {
        sent.push(validation);
        return new Promise(() => {});
      },
    });

    await proposalItems(screen)
      .nth(1)
      .getByRole("checkbox", { name: "Rejeter dans le lot" })
      .click();
    await validateBatchButton(screen).click();

    await expect.poll(() => sent).toEqual([{ batchId: BATCH_ID, rejected: [SECOND_ID] }]);
  });

  it("une case décochée n'est plus rejetée, et les autres le restent", async () => {
    const sent: { batchId: string; rejected: readonly string[] }[] = [];
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()), {
      validateBatch: (validation) => {
        sent.push(validation);
        return new Promise(() => {});
      },
    });
    const boxOf = (index: number) =>
      proposalItems(screen).nth(index).getByRole("checkbox", { name: "Rejeter dans le lot" });

    await boxOf(0).click();
    await boxOf(1).click();
    await boxOf(0).click();
    await validateBatchButton(screen).click();

    await expect.poll(() => sent).toEqual([{ batchId: BATCH_ID, rejected: [SECOND_ID] }]);
  });

  it("désactive le bouton pendant l'envoi", async () => {
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()));

    await validateBatchButton(screen).click();

    await expect.element(validateBatchButton(screen)).toBeDisabled();
  });

  it("après la validation, l'annonce, puis relit le lot, les lots du projet et les tokens du projet", async () => {
    const { readBatch, reads } = readingInTurn(
      makeTwoProposedBatch(),
      makeTwoProposedBatch({
        proposals: [
          makeProposal({ status: "validated" }),
          makeProposal({ id: SECOND_ID, status: "rejected" }),
        ],
      }),
    );
    const reviewed: string[] = [];
    const listed = { count: 0 };
    const { screen } = await renderBatch(readBatch, {
      validateBatch: () =>
        Promise.resolve(ok({ validated: [makeProposal().id], rejected: [SECOND_ID] })),
      onReviewed: ({ projectId }) => {
        reviewed.push(projectId);
        return Promise.resolve();
      },
      listBatches: () => {
        listed.count += 1;
        return Promise.resolve(
          ok([
            { id: BATCH_ID, intent: "Palette", state: "closed", toReview: 4 - 2 * listed.count },
          ]),
        );
      },
    });
    await expect.element(screen.getByText("2 à relire")).toBeVisible();

    await validateBatchButton(screen).click();

    await expect
      .element(batchValidationOutcome(screen))
      .toHaveTextContent("Lot validé : 1 validées, 1 rejetées.");
    await expect
      .element(proposalItems(screen).nth(1).getByText("Rejetée", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("0 à relire")).toBeVisible();
    expect(screen.getByRole("button", { name: "Valider le lot" }).elements()).toHaveLength(0);
    expect(reads.count).toBe(2);
    expect(reviewed).toEqual([PROJECT_ID]);
  });

  it("un lot rouvert entre-temps l'annonce, puis relit le lot", async () => {
    const { readBatch, reads } = readingInTurn(
      makeTwoProposedBatch(),
      makeTwoProposedBatch({ state: "open" }),
    );
    const { screen } = await renderBatch(readBatch, {
      validateBatch: () => Promise.resolve(err("batch_open")),
    });

    await validateBatchButton(screen).click();

    await expect
      .element(batchValidationOutcome(screen).getByRole("alert"))
      .toHaveTextContent("Ce lot est encore ouvert : l'IA peut encore y écrire.");
    await expect.element(screen.getByText("Ouvert", { exact: true })).toBeVisible();
    expect(reads.count).toBe(2);
  });

  it("un lot invalide liste ses erreurs avec le nom de chaque proposition, sans relire le lot", async () => {
    const { readBatch, reads } = readingInTurn(makeTwoProposedBatch());
    const reviewed: string[] = [];
    const unknownId = "7c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
    const { screen } = await renderBatch(readBatch, {
      validateBatch: () =>
        Promise.resolve(
          err({
            reason: "invalid_batch",
            errors: [
              {
                path: `proposals.${makeProposal().id}.$value`,
                message: "Référence vers un token non validé",
              },
              { path: `proposals.${SECOND_ID}.name`, message: "Nom déjà pris dans le projet" },
              { path: `proposals.${unknownId}.name`, message: "Nom déjà pris dans le projet" },
            ],
          }),
        ),
      onReviewed: ({ projectId }) => {
        reviewed.push(projectId);
        return Promise.resolve();
      },
    });

    await validateBatchButton(screen).click();

    const alert = batchValidationOutcome(screen).getByRole("alert");
    await expect.element(alert).toHaveTextContent("Ce lot est invalide :");
    await expect
      .element(alert.getByRole("listitem").nth(0))
      .toHaveTextContent("couleur.fond.primaire · $value : Référence vers un token non validé");
    await expect
      .element(alert.getByRole("listitem").nth(1))
      .toHaveTextContent("couleur.fond.second · name : Nom déjà pris dans le projet");
    await expect
      .element(alert.getByRole("listitem").nth(2))
      .toHaveTextContent(`proposals.${unknownId}.name : Nom déjà pris dans le projet`);
    await expect.element(validateBatchButton(screen)).toBeEnabled();
    expect(reads.count).toBe(1);
    expect(reviewed).toEqual([]);
  });

  it("montre tel quel un chemin qui ne désigne pas une proposition", async () => {
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()), {
      validateBatch: () =>
        Promise.resolve(
          err({
            reason: "invalid_batch",
            errors: [{ path: "rejected.1", message: "Proposition hors du lot" }],
          }),
        ),
    });

    await validateBatchButton(screen).click();

    await expect
      .element(batchValidationOutcome(screen).getByRole("alert").getByRole("listitem"))
      .toHaveTextContent("rejected.1 : Proposition hors du lot");
  });

  it("montre deux erreurs sur le même champ du lot, sans que React confonde leurs lignes", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const path = `proposals.${SECOND_ID}.name`;
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()), {
      validateBatch: () =>
        Promise.resolve(
          err({
            reason: "invalid_batch",
            errors: [
              { path, message: "Nom déjà pris dans le projet" },
              { path, message: "Nom en conflit de groupe avec le token couleur" },
            ],
          }),
        ),
    });

    await validateBatchButton(screen).click();

    const alert = batchValidationOutcome(screen).getByRole("alert");
    await expect
      .element(alert.getByRole("listitem").nth(1))
      .toHaveTextContent(
        "couleur.fond.second · name : Nom en conflit de groupe avec le token couleur",
      );
    expect(alert.getByRole("listitem").elements()).toHaveLength(2);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    consoleError.mockRestore();
  });

  it.each([
    ["not_found", "Ce lot est introuvable."],
    ["unavailable", "La validation du lot est indisponible pour le moment."],
    ["invalid_response", "La validation du lot est indisponible pour le moment."],
  ] as const)("annonce l'échec %s de la validation", async (failure, message) => {
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()), {
      validateBatch: () => Promise.resolve(err(failure)),
    });

    await validateBatchButton(screen).click();

    await expect
      .element(batchValidationOutcome(screen).getByRole("alert"))
      .toHaveTextContent(message);
  });

  it("renvoie vers la connexion quand la session expire avant la validation", async () => {
    const { screen } = await renderBatch(reading(makeTwoProposedBatch()), {
      validateBatch: () => Promise.resolve(err("unauthenticated")),
    });

    await validateBatchButton(screen).click();

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});
