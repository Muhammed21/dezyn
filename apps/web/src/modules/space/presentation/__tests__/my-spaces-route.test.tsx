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

import type { SpacesFailure } from "../../application/space-gateway.ts";
import type { Space } from "../../domain/space.ts";
import { mySpacesRoute } from "../my-spaces-route.tsx";

const makeSpace = (overrides: Partial<Space> = {}): Space => ({
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Studio Ada",
  plan: "free",
  role: "owner",
  ...overrides,
});

type ListMySpaces = () => Promise<Result<readonly Space[], SpacesFailure>>;
type SignOut = () => Promise<Result<undefined, unknown>>;

const signedOut: SignOut = () => Promise.resolve(ok(undefined));

const listing =
  (spaces: readonly Space[]): ListMySpaces =>
  () =>
    Promise.resolve(ok(spaces));

const renderMySpaces = (
  listMySpaces: ListMySpaces,
  {
    signOut = signedOut,
    queryClient = new QueryClient(),
  }: { readonly signOut?: SignOut; readonly queryClient?: QueryClient } = {},
) => {
  const root = createRootRoute();
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
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
      mySpacesRoute({ parent: root, listMySpaces, signOut }),
      signIn,
      spacePage,
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

describe("page de mes espaces (ADR 0044 §6)", () => {
  it("liste les noms des espaces du membre", async () => {
    const screen = await renderMySpaces(() =>
      Promise.resolve(
        ok([
          makeSpace(),
          makeSpace({ id: "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e", name: "Studio Grace" }),
        ]),
      ),
    );

    const list = screen.getByRole("list", { name: "Vos espaces" });
    await expect.element(list.getByRole("listitem").nth(0)).toHaveTextContent("Studio Ada");
    await expect.element(list.getByRole("listitem").nth(1)).toHaveTextContent("Studio Grace");
    expect(list.getByRole("listitem").elements()).toHaveLength(2);
  });

  it("mène de chaque espace à sa page", async () => {
    const screen = await renderMySpaces(() => Promise.resolve(ok([makeSpace()])));

    await screen.getByRole("link", { name: "Studio Ada" }).click();

    await expect.element(screen.getByText(`Page de l'espace ${makeSpace().id}`)).toBeVisible();
  });

  it("renvoie vers la connexion quand le membre n'a pas de session", async () => {
    const screen = await renderMySpaces(() => Promise.resolve(err("unauthenticated")));

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });

  it.each(["unavailable", "invalid_response"] as const)(
    "annonce que les espaces sont indisponibles sur %s",
    async (failure) => {
      const screen = await renderMySpaces(() => Promise.resolve(err(failure)));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Vos espaces sont indisponibles pour le moment.");
      expect(screen.getByRole("list").elements()).toHaveLength(0);
    },
  );
});

const pending = <T,>(): Promise<T> => new Promise<T>(() => {});

describe("déconnexion depuis mes espaces (ADR 0044 §7)", () => {
  it("ferme la session, vide les données lues et mène à la connexion", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["projects", makeSpace().id], ok([]));
    const calls = { count: 0 };
    const screen = await renderMySpaces(listing([makeSpace()]), {
      queryClient,
      signOut: () => {
        calls.count += 1;
        return Promise.resolve(ok(undefined));
      },
    });

    await screen.getByRole("button", { name: "Se déconnecter" }).click();

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
    expect(calls.count).toBe(1);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("ne relance pas la déconnexion tant que la précédente est en cours", async () => {
    const calls = { count: 0 };
    const screen = await renderMySpaces(listing([makeSpace()]), {
      signOut: () => {
        calls.count += 1;
        return pending();
      },
    });

    await screen.getByRole("button", { name: "Se déconnecter" }).click();

    await expect.element(screen.getByRole("button", { name: "Se déconnecter" })).toBeDisabled();
    expect(calls.count).toBe(1);
  });

  it("annonce l'échec de la déconnexion et garde les espaces affichés", async () => {
    const queryClient = new QueryClient();
    const screen = await renderMySpaces(listing([makeSpace()]), {
      queryClient,
      signOut: () => Promise.resolve(err("unavailable")),
    });

    await screen.getByRole("button", { name: "Se déconnecter" }).click();

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("La déconnexion est impossible pour le moment.");
    await expect.element(screen.getByRole("link", { name: "Studio Ada" })).toBeVisible();
    expect(queryClient.getQueryData(["my-spaces"])).toEqual(ok([makeSpace()]));
  });

  it("s'ouvre sans alerte de déconnexion", async () => {
    const screen = await renderMySpaces(listing([makeSpace()]));

    await expect.element(screen.getByRole("button", { name: "Se déconnecter" })).toBeEnabled();
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });
});
