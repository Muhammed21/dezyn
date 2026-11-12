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

import type { ProjectTokens, Token, TokensFailure } from "../../domain/token.ts";
import { projectTokensRoute } from "../project-tokens-route.tsx";

const PROJECT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_PROJECT_ID = "5a3b0d2f-8c4e-4f9b-a021-3d6e7f8a9b0c";
const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8], hex: "#3366cc" };
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4], hex: "#1a3366" };

type ReadTokens = (project: {
  readonly projectId: string;
}) => Promise<Result<ProjectTokens, TokensFailure>>;

const makeToken = (overrides: Partial<Token> = {}): Token => ({
  id: "0b6f3c2a-8d4e-4f1a-9c7b-5e2d1a0f9b8c",
  name: "couleur.fond.primaire",
  type: "color",
  value: { kind: "single", value: PRIMARY_BLUE },
  description: undefined,
  ...overrides,
});

const reading =
  (tokens: ProjectTokens): ReadTokens =>
  () =>
    Promise.resolve(ok(tokens));

const ProjectProposals = ({ projectId }: { readonly projectId: string }) => (
  <p>Propositions du projet {projectId}</p>
);

const renderProjectTokens = (
  readTokens: ReadTokens,
  history = createMemoryHistory({ initialEntries: [`/projets/${PROJECT_ID}`] }),
) => {
  const root = createRootRoute();
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      projectTokensRoute({ parent: root, readTokens, ProjectProposals }),
      signIn,
    ]),
    history,
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const tokenItems = (screen: Awaited<ReturnType<typeof renderProjectTokens>>) =>
  screen.getByRole("list", { name: "Tokens" }).getByRole("listitem");

describe("page des tokens d'un projet (ADR 0044 §6)", () => {
  it("liste les tokens du projet de l'adresse, dans l'ordre de l'API", async () => {
    const asked: string[] = [];
    const screen = await renderProjectTokens(({ projectId }) => {
      asked.push(projectId);
      return reading({
        modes: [],
        tokens: [
          makeToken({ name: "couleur.fond.primaire" }),
          makeToken({
            id: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
            name: "espacement.petit",
            type: "dimension",
            value: { kind: "single", value: { value: 8, unit: "px" } },
          }),
        ],
      })({ projectId });
    });

    await expect.element(screen.getByRole("heading", { name: "Tokens" })).toBeVisible();
    await expect.element(tokenItems(screen).nth(0)).toHaveTextContent("couleur.fond.primaire");
    await expect.element(tokenItems(screen).nth(1)).toHaveTextContent("espacement.petit");
    expect(tokenItems(screen).elements()).toHaveLength(2);
    expect(asked).toEqual([PROJECT_ID]);
  });

  it("relit les tokens de chaque projet : d'un projet à l'autre, les tokens changent", async () => {
    const history = createMemoryHistory({ initialEntries: [`/projets/${PROJECT_ID}`] });
    const screen = await renderProjectTokens(
      ({ projectId }) =>
        reading({ modes: [], tokens: [makeToken({ name: `token.de.${projectId}` })] })({
          projectId,
        }),
      history,
    );
    await expect.element(tokenItems(screen).nth(0)).toHaveTextContent(`token.de.${PROJECT_ID}`);

    history.push(`/projets/${OTHER_PROJECT_ID}`);

    await expect
      .element(tokenItems(screen).nth(0))
      .toHaveTextContent(`token.de.${OTHER_PROJECT_ID}`);
  });

  it("montre le type, la valeur brute en JSON et la description d'un token", async () => {
    const screen = await renderProjectTokens(
      reading({ modes: [], tokens: [makeToken({ description: "Fond des boutons" })] }),
    );

    const item = tokenItems(screen).nth(0);
    await expect.element(item.getByText("color", { exact: true })).toBeVisible();
    await expect.element(item).toHaveTextContent(JSON.stringify(PRIMARY_BLUE));
    await expect.element(item).toHaveTextContent("Fond des boutons");
  });

  it("nomme type inconnu un type que l'app ne connaît pas", async () => {
    const screen = await renderProjectTokens(
      reading({ modes: [], tokens: [makeToken({ type: "unknown" })] }),
    );

    const item = tokenItems(screen).nth(0);
    await expect.element(item.getByText("type inconnu", { exact: true })).toBeVisible();
    expect(item.getByText("unknown", { exact: true }).elements()).toHaveLength(0);
  });

  it("montre la valeur d'un token à modes dans chaque mode, dans l'ordre des modes du projet", async () => {
    const modal = makeToken({
      value: { kind: "by_mode", values: { sombre: NIGHT_BLUE, clair: PRIMARY_BLUE } },
    });
    const screen = await renderProjectTokens(
      reading({ modes: ["clair", "sombre"], tokens: [modal] }),
    );

    const values = screen.getByRole("list", { name: "Valeurs de couleur.fond.primaire" });
    await expect
      .element(values.getByRole("listitem").nth(0))
      .toHaveTextContent(`clair : ${JSON.stringify(PRIMARY_BLUE)}`);
    await expect
      .element(values.getByRole("listitem").nth(1))
      .toHaveTextContent(`sombre : ${JSON.stringify(NIGHT_BLUE)}`);
    expect(values.getByRole("listitem").elements()).toHaveLength(2);
  });

  it("mène à l'historique du projet", async () => {
    const screen = await renderProjectTokens(reading({ modes: [], tokens: [] }));

    await expect
      .element(screen.getByRole("link", { name: "Historique" }))
      .toHaveAttribute("href", `/projets/${PROJECT_ID}/historique`);
  });

  it("montre les propositions du projet de l'adresse, sous ses tokens", async () => {
    const screen = await renderProjectTokens(reading({ modes: [], tokens: [makeToken()] }));

    await expect.element(screen.getByText(`Propositions du projet ${PROJECT_ID}`)).toBeVisible();
  });

  it("annonce un projet sans token", async () => {
    const screen = await renderProjectTokens(reading({ modes: [], tokens: [] }));

    await expect.element(screen.getByText("Aucun token pour le moment.")).toBeVisible();
    expect(screen.getByRole("listitem").elements()).toHaveLength(0);
  });

  it("annonce le chargement des tokens", async () => {
    const screen = await renderProjectTokens(() => new Promise(() => {}));

    await expect.element(screen.getByText("Chargement des tokens…")).toBeVisible();
  });

  it("renvoie vers la connexion quand le membre n'a pas de session", async () => {
    const screen = await renderProjectTokens(() => Promise.resolve(err("unauthenticated")));

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });

  it.each([
    ["not_found", "Ce projet est introuvable."],
    ["unavailable", "Les tokens sont indisponibles pour le moment."],
    ["invalid_response", "Les tokens sont indisponibles pour le moment."],
  ] as const)("annonce l'échec %s de la lecture", async (failure, message) => {
    const screen = await renderProjectTokens(() => Promise.resolve(err(failure)));

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("list").elements()).toHaveLength(0);
  });
});
