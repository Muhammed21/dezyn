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

const renderMySpaces = (listMySpaces: () => Promise<Result<readonly Space[], SpacesFailure>>) => {
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
    routeTree: root.addChildren([mySpacesRoute({ parent: root, listMySpaces }), signIn, spacePage]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
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
