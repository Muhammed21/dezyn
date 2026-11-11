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

import type { ProjectToCreate } from "../../application/project-gateway.ts";
import type {
  ListedProject,
  Project,
  ProjectCreationFailure,
  ProjectsFailure,
} from "../../domain/project.ts";
import { spaceProjectsRoute } from "../space-projects-route.tsx";

const SPACE_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const CREATED_AT = new Date("2026-11-11T18:00:00.000Z");

type ListProjects = (space: {
  readonly spaceId: string;
}) => Promise<Result<readonly ListedProject[], ProjectsFailure>>;
type CreateProject = (project: ProjectToCreate) => Promise<Result<Project, ProjectCreationFailure>>;

const makeProject = (overrides: Partial<ListedProject> = {}): ListedProject => ({
  id: "0b6f3c2a-8d4e-4f1a-9c7b-5e2d1a0f9b8c",
  spaceId: SPACE_ID,
  name: "Site vitrine",
  createdAt: CREATED_AT,
  historyPurgedAt: undefined,
  ...overrides,
});

const pending = <T,>(): Promise<T> => new Promise<T>(() => {});

const listing =
  (projects: readonly ListedProject[]): ListProjects =>
  () =>
    Promise.resolve(ok(projects));

const refusing =
  (failure: ProjectCreationFailure): CreateProject =>
  () =>
    Promise.resolve(err(failure));

const renderSpaceProjects = ({
  listProjects = listing([]),
  createProject = refusing("unavailable"),
}: {
  readonly listProjects?: ListProjects;
  readonly createProject?: CreateProject;
} = {}) => {
  const root = createRootRoute();
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      spaceProjectsRoute({ parent: root, listProjects, createProject }),
      signIn,
    ]),
    history: createMemoryHistory({ initialEntries: [`/espaces/${SPACE_ID}`] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const create = async (screen: Awaited<ReturnType<typeof renderSpaceProjects>>, name: string) => {
  await screen.getByLabelText("Nom du projet").fill(name);
  await screen.getByRole("button", { name: "Créer le projet" }).click();
};

describe("page des projets d'un espace (ADR 0044 §6)", () => {
  it("liste les projets de l'espace de l'adresse", async () => {
    const asked: string[] = [];
    const screen = await renderSpaceProjects({
      listProjects: ({ spaceId }) => {
        asked.push(spaceId);
        return listing([
          makeProject({ name: "Application" }),
          makeProject({ id: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", name: "Site vitrine" }),
        ])({ spaceId });
      },
    });

    await expect.element(screen.getByRole("heading", { name: "Projets" })).toBeVisible();
    const list = screen.getByRole("list", { name: "Projets" });
    await expect.element(list.getByRole("listitem").nth(0)).toHaveTextContent("Application");
    await expect.element(list.getByRole("listitem").nth(1)).toHaveTextContent("Site vitrine");
    expect(list.getByRole("listitem").elements()).toHaveLength(2);
    expect(asked).toEqual([SPACE_ID]);
  });

  it("annonce un espace sans projet", async () => {
    const screen = await renderSpaceProjects();

    await expect.element(screen.getByText("Aucun projet pour le moment.")).toBeVisible();
    expect(screen.getByRole("listitem").elements()).toHaveLength(0);
  });

  it("renvoie vers la connexion quand le membre n'a pas de session", async () => {
    const screen = await renderSpaceProjects({
      listProjects: () => Promise.resolve(err("unauthenticated")),
    });

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });

  it.each([
    ["not_found", "Cet espace est introuvable."],
    ["unavailable", "Les projets sont indisponibles pour le moment."],
    ["invalid_response", "Les projets sont indisponibles pour le moment."],
  ] as const)("annonce l'échec %s de la lecture", async (failure, message) => {
    const screen = await renderSpaceProjects({
      listProjects: () => Promise.resolve(err(failure)),
    });

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("list").elements()).toHaveLength(0);
  });

  it("s'ouvre sur un champ de nom vide", async () => {
    const screen = await renderSpaceProjects();

    await expect.element(screen.getByLabelText("Nom du projet")).toHaveValue("");
  });

  it("crée le projet, l'ajoute à la liste et vide le champ", async () => {
    const stored: { projects: readonly ListedProject[] } = { projects: [] };
    const received: ProjectToCreate[] = [];
    const screen = await renderSpaceProjects({
      listProjects: () => Promise.resolve(ok(stored.projects)),
      createProject: (project) => {
        received.push(project);
        const created = makeProject({ name: project.name });
        stored.projects = [...stored.projects, created];
        return Promise.resolve(ok(created));
      },
    });
    await expect.element(screen.getByText("Aucun projet pour le moment.")).toBeVisible();

    await create(screen, "Site vitrine");

    const list = screen.getByRole("list", { name: "Projets" });
    await expect.element(list.getByRole("listitem").nth(0)).toHaveTextContent("Site vitrine");
    await expect.element(screen.getByLabelText("Nom du projet")).toHaveValue("");
    expect(received).toEqual([{ spaceId: SPACE_ID, name: "Site vitrine" }]);
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });

  it.each([
    [
      { reason: "plan_required", limit: 3 },
      "Le plan Free est limité à 3 projets. Passez au plan Team pour en créer d'autres.",
    ],
    [
      { reason: "plan_required", limit: undefined },
      "Votre plan ne permet pas de créer d'autre projet. Passez au plan Team.",
    ],
    ["invalid_name", "Le nom doit compter de 1 à 100 caractères."],
    ["forbidden", "Vous n'avez pas le droit de créer un projet dans cet espace."],
    ["not_found", "Cet espace est introuvable."],
    ["unavailable", "La création est impossible pour le moment."],
    ["invalid_response", "La création est impossible pour le moment."],
  ] as const)(
    "annonce l'échec %j de la création, sans effacer la liste",
    async (failure, message) => {
      const screen = await renderSpaceProjects({
        listProjects: listing([makeProject()]),
        createProject: refusing(failure),
      });

      await create(screen, "Application");

      await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
      await expect
        .element(screen.getByRole("list", { name: "Projets" }).getByRole("listitem"))
        .toHaveTextContent("Site vitrine");
    },
  );

  it("garde le nom saisi et ne relit pas la liste après un échec", async () => {
    const reads = { count: 0 };
    const screen = await renderSpaceProjects({
      listProjects: () => {
        reads.count += 1;
        return Promise.resolve(ok([makeProject()]));
      },
      createProject: refusing("forbidden"),
    });

    await create(screen, "Application");

    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(screen.getByLabelText("Nom du projet")).toHaveValue("Application");
    expect(reads.count).toBe(1);
  });

  it("renvoie vers la connexion quand la session expire pendant la création", async () => {
    const screen = await renderSpaceProjects({ createProject: refusing("unauthenticated") });

    await create(screen, "Application");

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });

  it("ne relance pas la création tant que la précédente est en cours", async () => {
    const received: ProjectToCreate[] = [];
    const screen = await renderSpaceProjects({
      createProject: (project) => {
        received.push(project);
        return pending();
      },
    });

    await create(screen, "Application");

    await expect.element(screen.getByRole("button", { name: "Créer le projet" })).toBeDisabled();
    expect(received).toHaveLength(1);
  });

  it("retire l'ancien message d'échec pendant une nouvelle création", async () => {
    const answers: readonly Promise<Result<Project, ProjectCreationFailure>>[] = [
      Promise.resolve(err("forbidden")),
      pending(),
    ];
    const attempts = { count: 0 };
    const screen = await renderSpaceProjects({
      createProject: () => {
        const answer = answers[attempts.count] ?? pending();
        attempts.count += 1;
        return answer;
      },
    });
    await create(screen, "Application");
    await expect.element(screen.getByRole("alert")).toBeVisible();

    await screen.getByRole("button", { name: "Créer le projet" }).click();

    await expect.element(screen.getByRole("button", { name: "Créer le projet" })).toBeDisabled();
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });
});
