import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type RouterHistory,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { err, ok, type Result } from "@repo/result";

import type { MembersFailure, SpaceMember } from "../../domain/space.ts";
import { spaceMembers } from "../space-members.tsx";

const SPACE_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

type ListMembers = (space: {
  readonly spaceId: string;
}) => Promise<Result<readonly SpaceMember[], MembersFailure>>;

const makeMember = (overrides: Partial<SpaceMember> = {}): SpaceMember => ({
  userId: "7b3d4e8a-9f10-4c5d-8e7f-8a9b4f2a9c1e",
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  role: "owner",
  ...overrides,
});

const renderSpaceMembers = async (
  listMembers: ListMembers,
  history: RouterHistory = createMemoryHistory({ initialEntries: [`/espaces/${SPACE_ID}`] }),
) => {
  const SpaceMembers = spaceMembers({ listMembers });
  const root = createRootRoute();
  const spacePage = createRoute({
    getParentRoute: () => root,
    path: "/espaces/$spaceId",
    component: function SpacePage() {
      return <SpaceMembers spaceId={spacePage.useParams().spaceId} />;
    },
  });
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([spacePage, signIn]),
    history,
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

type Screen = Awaited<ReturnType<typeof renderSpaceMembers>>;

const memberList = (screen: Screen) => screen.getByRole("list", { name: "Membres" });

describe("membres de l'espace (ADR 0044 §5)", () => {
  it("liste les membres de l'espace de la page avec leur nom, leur email et leur rôle, dans l'ordre reçu", async () => {
    const asked: string[] = [];
    const ada = makeMember({ name: "Ada Lovelace", email: "ada@dezyn.test", role: "owner" });
    const grace = makeMember({
      userId: "9f10a2c5-d6e7-4f8a-9b4f-2a9c1e7b3d4e",
      name: "Grace Hopper",
      email: "grace@dezyn.test",
      role: "editor",
    });
    const screen = await renderSpaceMembers(({ spaceId }) => {
      asked.push(spaceId);
      return Promise.resolve(ok([ada, grace]));
    });

    await expect.element(screen.getByRole("heading", { name: "Membres" })).toBeVisible();
    await expect.element(memberList(screen)).toBeVisible();
    const rows = memberList(screen).getByRole("listitem").elements();
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Ada Lovelace.*ada@dezyn\.test.*Propriétaire/),
      expect.stringMatching(/Grace Hopper.*grace@dezyn\.test.*Éditeur/),
    ]);
    expect(asked).toEqual([SPACE_ID]);
  });

  it("relit les membres de chaque espace : d'un espace à l'autre, la liste change", async () => {
    const otherSpaceId = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";
    const history = createMemoryHistory({ initialEntries: [`/espaces/${SPACE_ID}`] });
    const screen = await renderSpaceMembers(
      ({ spaceId }) =>
        Promise.resolve(
          ok([
            spaceId === SPACE_ID
              ? makeMember({ name: "Ada Lovelace" })
              : makeMember({ name: "Grace Hopper" }),
          ]),
        ),
      history,
    );
    await expect.element(memberList(screen)).toHaveTextContent("Ada Lovelace");

    history.push(`/espaces/${otherSpaceId}`);

    await expect.element(memberList(screen)).toHaveTextContent("Grace Hopper");
  });

  it("affiche « Rôle inconnu » pour un rôle inconnu de l'app", async () => {
    const screen = await renderSpaceMembers(() =>
      Promise.resolve(ok([makeMember({ role: "unknown" })])),
    );

    await expect
      .element(memberList(screen).getByRole("listitem"))
      .toHaveTextContent("Rôle inconnu");
  });

  it("annonce le chargement des membres", async () => {
    const screen = await renderSpaceMembers(() => new Promise(() => {}));

    await expect.element(screen.getByText("Chargement des membres…")).toBeVisible();
    expect(memberList(screen).query()).toBeNull();
  });

  it.each([
    ["not_found", "Cet espace est introuvable."],
    ["unavailable", "Les membres sont indisponibles pour le moment."],
    ["invalid_response", "Les membres sont indisponibles pour le moment."],
  ] as const)("annonce l'échec %s dans la section Membres", async (failure, message) => {
    const screen = await renderSpaceMembers(() => Promise.resolve(err(failure)));

    await expect
      .element(screen.getByRole("region", { name: "Membres" }).getByRole("alert"))
      .toHaveTextContent(message);
    expect(memberList(screen).query()).toBeNull();
    expect(screen.getByText("Chargement des membres…").query()).toBeNull();
  });

  it("renvoie vers la connexion quand le membre n'a plus de session", async () => {
    const screen = await renderSpaceMembers(() => Promise.resolve(err("unauthenticated")));

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});
