import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { err, ok, type Result } from "@repo/result";

import type { Batch, Proposal, ProposalFailure } from "../../domain/proposal.ts";
import { proposalBatchRoute } from "../proposal-batch-route.tsx";

const BATCH_ID = "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_BATCH_ID = "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PROJECT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.1, 0.4, 0.9] };
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

type ReadBatch = (batch: { readonly batchId: string }) => Promise<Result<Batch, ProposalFailure>>;

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

const renderBatch = async (readBatch: ReadBatch) => {
  const root = createRootRoute();
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
  });
  const history = createMemoryHistory({ initialEntries: [`/lots/${BATCH_ID}`] });
  const router = createRouter({
    routeTree: root.addChildren([proposalBatchRoute({ parent: root, readBatch }), signIn]),
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

const proposalItems = (screen: Screen) =>
  screen.getByRole("list", { name: "Propositions du lot" }).getByRole("listitem");

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
