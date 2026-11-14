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

import type {
  AssignableRole,
  ChangedRole,
  MembersFailure,
  RoleChangeFailure,
  Space,
  SpaceFailure,
  SpaceMember,
} from "../../domain/space.ts";
import { spaceMembers } from "../space-members.tsx";

const SPACE_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

type ListMembers = (space: {
  readonly spaceId: string;
}) => Promise<Result<readonly SpaceMember[], MembersFailure>>;

type ReadSpace = (space: { readonly spaceId: string }) => Promise<Result<Space, SpaceFailure>>;

type RoleChange = {
  readonly spaceId: string;
  readonly memberId: string;
  readonly role: AssignableRole;
};

type ChangeRole = (change: RoleChange) => Promise<Result<ChangedRole, RoleChangeFailure>>;

const makeMember = (overrides: Partial<SpaceMember> = {}): SpaceMember => ({
  userId: "7b3d4e8a-9f10-4c5d-8e7f-8a9b4f2a9c1e",
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  role: "owner",
  ...overrides,
});

const ADA = makeMember();

const GRACE = makeMember({
  userId: "9f10a2c5-d6e7-4f8a-9b4f-2a9c1e7b3d4e",
  name: "Grace Hopper",
  email: "grace@dezyn.test",
  role: "editor",
});

const OWNER_RIGHTS = {
  role: "owner",
  allowedActions: ["space.read", "member.invite", "member.manage"],
} as const;

const EDITOR_RIGHTS = { role: "editor", allowedActions: ["space.read"] } as const;

const makeSpace = (overrides: Partial<Space> = {}): Space => ({
  id: SPACE_ID,
  name: "Studio Ada",
  plan: "team",
  ...EDITOR_RIGHTS,
  ...overrides,
});

const pending = () => new Promise<never>(() => {});

const readEditorSpace: ReadSpace = () => Promise.resolve(ok(makeSpace(EDITOR_RIGHTS)));

const readOwnerSpace: ReadSpace = () => Promise.resolve(ok(makeSpace(OWNER_RIGHTS)));

const readSpaceFailing: ReadSpace = () => Promise.resolve(err("unavailable"));

const listAdaAndGrace: ListMembers = () => Promise.resolve(ok([ADA, GRACE]));

const renderSpaceMembers = async ({
  listMembers,
  readSpace = readEditorSpace,
  changeRole = pending,
  history = createMemoryHistory({ initialEntries: [`/espaces/${SPACE_ID}`] }),
  queryClient = new QueryClient(),
}: {
  readonly listMembers: ListMembers;
  readonly readSpace?: ReadSpace;
  readonly changeRole?: ChangeRole;
  readonly history?: RouterHistory;
  readonly queryClient?: QueryClient;
}) => {
  const SpaceMembers = spaceMembers({ listMembers, readSpace, changeRole });
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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

type Screen = Awaited<ReturnType<typeof renderSpaceMembers>>;

const memberList = (screen: Screen) => screen.getByRole("list", { name: "Membres" });

const membersSection = (screen: Screen) => screen.getByRole("region", { name: "Membres" });

describe("membres de l'espace (ADR 0044 §5)", () => {
  it("liste les membres de l'espace de la page avec leur nom, leur email et leur rôle, dans l'ordre reçu", async () => {
    const asked: string[] = [];
    const screen = await renderSpaceMembers({
      listMembers: ({ spaceId }) => {
        asked.push(spaceId);
        return Promise.resolve(ok([ADA, GRACE]));
      },
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
    const screen = await renderSpaceMembers({
      listMembers: ({ spaceId }) =>
        Promise.resolve(
          ok([
            spaceId === SPACE_ID
              ? makeMember({ name: "Ada Lovelace" })
              : makeMember({ name: "Grace Hopper" }),
          ]),
        ),
      history,
    });
    await expect.element(memberList(screen)).toHaveTextContent("Ada Lovelace");

    history.push(`/espaces/${otherSpaceId}`);

    await expect.element(memberList(screen)).toHaveTextContent("Grace Hopper");
  });

  it("affiche « Rôle inconnu » pour un rôle inconnu de l'app", async () => {
    const screen = await renderSpaceMembers({
      listMembers: () => Promise.resolve(ok([makeMember({ role: "unknown" })])),
    });

    await expect
      .element(memberList(screen).getByRole("listitem"))
      .toHaveTextContent("Rôle inconnu");
  });

  it("annonce le chargement des membres", async () => {
    const screen = await renderSpaceMembers({ listMembers: pending });

    await expect.element(screen.getByText("Chargement des membres…")).toBeVisible();
    expect(memberList(screen).query()).toBeNull();
  });

  it.each([
    ["not_found", "Cet espace est introuvable."],
    ["unavailable", "Les membres sont indisponibles pour le moment."],
    ["invalid_response", "Les membres sont indisponibles pour le moment."],
  ] as const)("annonce l'échec %s dans la section Membres", async (failure, message) => {
    const screen = await renderSpaceMembers({ listMembers: () => Promise.resolve(err(failure)) });

    await expect.element(membersSection(screen).getByRole("alert")).toHaveTextContent(message);
    expect(memberList(screen).query()).toBeNull();
    expect(screen.getByText("Chargement des membres…").query()).toBeNull();
  });

  it("renvoie vers la connexion quand le membre n'a plus de session", async () => {
    const screen = await renderSpaceMembers({
      listMembers: () => Promise.resolve(err("unauthenticated")),
    });

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});

const answeringChange = (outcome: Result<ChangedRole, RoleChangeFailure>) => {
  const changes: RoleChange[] = [];
  const changeRole: ChangeRole = (change) => {
    changes.push(change);
    return Promise.resolve(outcome);
  };
  return { changes, changeRole };
};

const promoteGraceButton = (screen: Screen) =>
  screen.getByRole("button", { name: "Rendre propriétaire Grace Hopper" });

const demoteAdaButton = (screen: Screen) =>
  screen.getByRole("button", { name: "Rendre éditeur Ada Lovelace" });

describe("changement de rôle d'un membre (ADR 0017)", () => {
  it("le propriétaire voit « Rendre propriétaire » pour un éditeur et « Rendre éditeur » pour un propriétaire", async () => {
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: readOwnerSpace,
    });

    await expect.element(demoteAdaButton(screen)).toHaveTextContent("Rendre éditeur");
    await expect.element(promoteGraceButton(screen)).toHaveTextContent("Rendre propriétaire");
    expect(screen.getByRole("button", { name: "Rendre propriétaire Ada Lovelace" }).query()).toBe(
      null,
    );
    expect(screen.getByRole("button", { name: "Rendre éditeur Grace Hopper" }).query()).toBeNull();
  });

  it("aucun bouton pour un membre dont le rôle est inconnu de l'app", async () => {
    const screen = await renderSpaceMembers({
      listMembers: () =>
        Promise.resolve(ok([makeMember({ name: "Alan Turing", role: "unknown" }), GRACE])),
      readSpace: readOwnerSpace,
    });

    await expect.element(promoteGraceButton(screen)).toBeVisible();
    expect(memberList(screen).getByRole("listitem").first().getByRole("button").query()).toBeNull();
  });

  it.each([
    ["un éditeur, sans member.manage", readEditorSpace],
    ["l'espace pas encore lu", pending],
    ["la lecture de l'espace en échec", readSpaceFailing],
  ] as const)("aucun bouton pour %s", async (_case, readSpace) => {
    const screen = await renderSpaceMembers({ listMembers: listAdaAndGrace, readSpace });

    await expect.element(memberList(screen)).toHaveTextContent("Grace Hopper");
    expect(memberList(screen).getByRole("button").elements()).toEqual([]);
  });

  it.each([
    ["promeut Grace propriétaire", promoteGraceButton, { memberId: GRACE.userId, role: "owner" }],
    ["rétrograde Ada éditrice", demoteAdaButton, { memberId: ADA.userId, role: "editor" }],
  ] as const)(
    "%s dans l'espace de la page, et désactive le bouton cliqué pendant le changement",
    async (_case, button, change) => {
      const changes: RoleChange[] = [];
      const screen = await renderSpaceMembers({
        listMembers: listAdaAndGrace,
        readSpace: readOwnerSpace,
        changeRole: (asked) => {
          changes.push(asked);
          return pending();
        },
      });

      await button(screen).click();

      expect(changes).toEqual([{ spaceId: SPACE_ID, ...change }]);
      await expect.element(button(screen)).toBeDisabled();
    },
  );

  it("ne désactive que le bouton cliqué", async () => {
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: readOwnerSpace,
    });

    await promoteGraceButton(screen).click();

    await expect.element(promoteGraceButton(screen)).toBeDisabled();
    await expect.element(demoteAdaButton(screen)).toBeEnabled();
  });

  it("après le changement, relit les membres : Grace apparaît propriétaire", async () => {
    const listed: string[] = [];
    const { changeRole } = answeringChange(ok({ userId: GRACE.userId, role: "owner" }));
    const screen = await renderSpaceMembers({
      listMembers: ({ spaceId }) => {
        listed.push(spaceId);
        return Promise.resolve(
          ok([ADA, listed.length === 1 ? GRACE : { ...GRACE, role: "owner" }]),
        );
      },
      readSpace: readOwnerSpace,
      changeRole,
    });

    await promoteGraceButton(screen).click();

    await expect
      .element(screen.getByRole("button", { name: "Rendre éditeur Grace Hopper" }))
      .toBeVisible();
    await expect
      .element(memberList(screen).getByRole("listitem").last())
      .toHaveTextContent(/Grace Hopper.*Propriétaire/);
    expect(listed).toEqual([SPACE_ID, SPACE_ID]);
  });

  it("le propriétaire qui se rétrograde perd les boutons réservés au propriétaire, une fois l'espace relu", async () => {
    const reads: string[] = [];
    const { changeRole } = answeringChange(ok({ userId: ADA.userId, role: "editor" }));
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: ({ spaceId }) => {
        reads.push(spaceId);
        return Promise.resolve(ok(makeSpace(reads.length === 1 ? OWNER_RIGHTS : EDITOR_RIGHTS)));
      },
      changeRole,
    });

    await demoteAdaButton(screen).click();

    await expect.poll(() => memberList(screen).getByRole("button").elements()).toEqual([]);
    expect(reads).toEqual([SPACE_ID, SPACE_ID]);
  });

  it("après le changement, la liste de mes espaces est à relire", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["my-spaces"], ok([]));
    const { changes, changeRole } = answeringChange(ok({ userId: GRACE.userId, role: "owner" }));
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: readOwnerSpace,
      changeRole,
      queryClient,
    });

    await promoteGraceButton(screen).click();

    await expect.poll(() => changes.length).toBe(1);
    await expect.poll(() => queryClient.getQueryState(["my-spaces"])?.isInvalidated).toBe(true);
  });

  it.each([
    ["last_owner", "L'espace doit garder au moins un propriétaire."],
    ["forbidden", "Vous n'avez pas le droit de gérer les membres de cet espace."],
    ["not_found", "Ce membre est introuvable."],
    ["unavailable", "Le changement de rôle est indisponible pour le moment."],
    ["invalid_response", "Le changement de rôle est indisponible pour le moment."],
  ] as const)("annonce l'échec %s dans la section Membres", async (failure, message) => {
    const { changeRole } = answeringChange(err(failure));
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: readOwnerSpace,
      changeRole,
    });

    await demoteAdaButton(screen).click();

    await expect.element(membersSection(screen).getByRole("alert")).toHaveTextContent(message);
    await expect.element(demoteAdaButton(screen)).toBeEnabled();
  });

  it("un échec ne relit ni les membres ni l'espace", async () => {
    const listed: string[] = [];
    const reads: string[] = [];
    const { changeRole } = answeringChange(err("last_owner"));
    const screen = await renderSpaceMembers({
      listMembers: ({ spaceId }) => {
        listed.push(spaceId);
        return Promise.resolve(ok([ADA, GRACE]));
      },
      readSpace: ({ spaceId }) => {
        reads.push(spaceId);
        return Promise.resolve(ok(makeSpace(OWNER_RIGHTS)));
      },
      changeRole,
    });

    await demoteAdaButton(screen).click();

    await expect.element(membersSection(screen).getByRole("alert")).toBeVisible();
    expect(listed).toEqual([SPACE_ID]);
    expect(reads).toEqual([SPACE_ID]);
  });

  it("un nouvel essai efface l'ancien message", async () => {
    const changes: RoleChange[] = [];
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: readOwnerSpace,
      changeRole: (change) => {
        changes.push(change);
        return changes.length === 1 ? Promise.resolve(err("last_owner")) : pending();
      },
    });
    await demoteAdaButton(screen).click();
    await expect.element(membersSection(screen).getByRole("alert")).toBeVisible();

    await promoteGraceButton(screen).click();

    await expect.element(promoteGraceButton(screen)).toBeDisabled();
    expect(membersSection(screen).getByRole("alert").query()).toBeNull();
  });

  it("renvoie vers la connexion quand le propriétaire n'a plus de session", async () => {
    const { changeRole } = answeringChange(err("unauthenticated"));
    const screen = await renderSpaceMembers({
      listMembers: listAdaAndGrace,
      readSpace: readOwnerSpace,
      changeRole,
    });

    await demoteAdaButton(screen).click();

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});
