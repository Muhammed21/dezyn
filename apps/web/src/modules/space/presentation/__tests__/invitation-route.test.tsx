import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { err, ok, type Result } from "@repo/result";

import type { AcceptanceFailure, Space } from "../../domain/space.ts";
import { invitationRoute } from "../invitation-route.tsx";

const TOKEN = "q3Zt8kV0yXlN2mB7cR4wE1sD6fG9hJ5aL0pO3iU8tYk";
const SPACE_ID = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";

type AcceptInvitation = (invitation: {
  readonly token: string;
}) => Promise<Result<Space, AcceptanceFailure>>;

const makeSpace = (overrides: Partial<Space> = {}): Space => ({
  id: SPACE_ID,
  name: "Studio Ada",
  plan: "team",
  role: "editor",
  allowedActions: ["space.read"],
  ...overrides,
});

const SignInPage = () => {
  const href = useRouterState({ select: (state) => state.location.href });
  return <p>Page de connexion {href}</p>;
};

const renderInvitation = async (
  acceptInvitation: AcceptInvitation,
  { queryClient = new QueryClient() }: { readonly queryClient?: QueryClient } = {},
) => {
  const root = createRootRoute();
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: SignInPage,
  });
  const spacePage = createRoute({
    getParentRoute: () => root,
    path: "/espaces/$spaceId",
    component: function SpacePage() {
      return <p>Page de l'espace {spacePage.useParams().spaceId}</p>;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([
      invitationRoute({ parent: root, acceptInvitation }),
      signIn,
      spacePage,
    ]),
    history: createMemoryHistory({ initialEntries: [`/invitations/${TOKEN}`] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

type Screen = Awaited<ReturnType<typeof renderInvitation>>;

const acceptButton = (screen: Screen) =>
  screen.getByRole("button", { name: "Accepter l'invitation" });

describe("page d'une invitation (ADR 0011, ADR 0044 §6)", () => {
  it("annonce l'invitation sans l'accepter tant que l'invité n'a pas cliqué", async () => {
    const accepted: string[] = [];
    const screen = await renderInvitation(({ token }) => {
      accepted.push(token);
      return Promise.resolve(ok(makeSpace()));
    });

    await expect
      .element(screen.getByRole("heading", { name: "Vous êtes invité à rejoindre un espace" }))
      .toBeVisible();
    await expect.element(acceptButton(screen)).toBeEnabled();
    expect(accepted).toEqual([]);
  });

  it("accepte le jeton de l'adresse, relit mes espaces et mène à l'espace rejoint", async () => {
    const accepted: string[] = [];
    const queryClient = new QueryClient();
    queryClient.setQueryData(["my-spaces"], ok([]));
    const screen = await renderInvitation(
      ({ token }) => {
        accepted.push(token);
        return Promise.resolve(ok(makeSpace()));
      },
      { queryClient },
    );

    await acceptButton(screen).click();

    await expect.element(screen.getByText(`Page de l'espace ${SPACE_ID}`)).toBeVisible();
    expect(accepted).toEqual([TOKEN]);
    expect(queryClient.getQueryState(["my-spaces"])?.isInvalidated).toBe(true);
  });

  it("désactive le bouton pendant l'envoi", async () => {
    const screen = await renderInvitation(() => new Promise(() => {}));

    await acceptButton(screen).click();

    await expect.element(acceptButton(screen)).toBeDisabled();
  });

  it.each([
    ["gone", "Cette invitation a expiré ou a déjà servi."],
    ["email_mismatch", "Cette invitation est adressée à un autre email."],
    ["already_member", "Vous êtes déjà membre de cet espace."],
    ["plan_required", "Cet espace doit passer au plan Team pour accueillir un membre."],
    ["unavailable", "L'acceptation est indisponible pour le moment."],
    ["invalid_response", "L'acceptation est indisponible pour le moment."],
  ] as const)("annonce l'échec %s", async (failure, message) => {
    const screen = await renderInvitation(() => Promise.resolve(err(failure)));

    await acceptButton(screen).click();

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    await expect.element(acceptButton(screen)).toBeEnabled();
  });

  it("renvoie vers la connexion avec l'adresse de l'invitation quand l'invité n'a pas de session", async () => {
    const screen = await renderInvitation(() => Promise.resolve(err("unauthenticated")));

    await acceptButton(screen).click();

    await expect
      .element(screen.getByText(/^Page de connexion/))
      .toHaveTextContent(
        `Page de connexion /connexion?redirect=${encodeURIComponent(`/invitations/${TOKEN}`)}`,
      );
  });
});
