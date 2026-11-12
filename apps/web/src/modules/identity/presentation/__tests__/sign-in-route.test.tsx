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

import type { SignInFailure } from "../../application/identity-gateway.ts";
import type { Credentials, Session } from "../../domain/session.ts";
import { signInRoute } from "../sign-in-route.tsx";

const ADA: Session = { userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", email: "ada@dezyn.test" };

type SignIn = (credentials: Credentials) => Promise<Result<Session, SignInFailure>>;

const renderSignIn = (signIn: SignIn, queryClient: QueryClient = new QueryClient()) => {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>Accueil</p>,
  });
  const signUp = createRoute({
    getParentRoute: () => root,
    path: "/inscription",
    component: () => <p>Page d'inscription</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([signInRoute({ parent: root, signIn }), home, signUp]),
    history: createMemoryHistory({ initialEntries: ["/connexion"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const submit = async (
  screen: Awaited<ReturnType<typeof renderSignIn>>,
  { email, password }: Credentials,
) => {
  await screen.getByLabelText("Email").fill(email);
  await screen.getByLabelText("Mot de passe").fill(password);
  await screen.getByRole("button", { name: "Se connecter" }).click();
};

const pending = <T,>(): Promise<T> => new Promise<T>(() => {});

const CREDENTIALS = { email: "ada@dezyn.test", password: "un-mot-de-passe-solide" };

describe("page de connexion (ADR 0044 §7)", () => {
  it("connecte le membre avec ses identifiants puis l'emmène à l'accueil", async () => {
    const received: Credentials[] = [];
    const screen = await renderSignIn((credentials) => {
      received.push(credentials);
      return Promise.resolve(ok(ADA));
    });

    await submit(screen, CREDENTIALS);

    await expect.element(screen.getByText("Accueil")).toBeVisible();
    expect(received).toEqual([CREDENTIALS]);
  });

  it("oublie les données lues avant la connexion", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["my-spaces"], err("unauthenticated"));
    const screen = await renderSignIn(() => Promise.resolve(ok(ADA)), queryClient);

    await submit(screen, CREDENTIALS);

    await expect.element(screen.getByText("Accueil")).toBeVisible();
    expect(queryClient.getQueryData(["my-spaces"])).toBeUndefined();
  });

  it.each([
    ["invalid_credentials", "Email ou mot de passe incorrect."],
    ["rate_limited", "Trop de tentatives, réessayez plus tard."],
    ["unavailable", "La connexion est impossible pour le moment."],
    ["invalid_response", "La connexion est impossible pour le moment."],
  ] as const)("sur %s, reste sur la page et l'annonce", async (failure, message) => {
    const screen = await renderSignIn(() => Promise.resolve(err(failure)));

    await submit(screen, CREDENTIALS);

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    await expect.element(screen.getByRole("heading", { name: "Connexion" })).toBeVisible();
  });

  it("ne relance pas la connexion tant que la précédente est en cours", async () => {
    const received: Credentials[] = [];
    const screen = await renderSignIn((credentials) => {
      received.push(credentials);
      return pending();
    });

    await submit(screen, CREDENTIALS);

    await expect.element(screen.getByRole("button", { name: "Se connecter" })).toBeDisabled();
    expect(received).toHaveLength(1);
  });

  it("retire l'ancien message d'échec pendant une nouvelle tentative", async () => {
    const answers: readonly Promise<Result<Session, SignInFailure>>[] = [
      Promise.resolve(err("invalid_credentials")),
      pending(),
    ];
    const attempts = { count: 0 };
    const screen = await renderSignIn(() => {
      const answer = answers[attempts.count] ?? pending();
      attempts.count += 1;
      return answer;
    });
    await submit(screen, CREDENTIALS);
    await expect.element(screen.getByRole("alert")).toBeVisible();

    await screen.getByRole("button", { name: "Se connecter" }).click();

    await expect.element(screen.getByRole("button", { name: "Se connecter" })).toBeDisabled();
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });

  it("s'ouvre sur un formulaire vide, sans erreur annoncée", async () => {
    const screen = await renderSignIn(() => Promise.resolve(ok(ADA)));

    await expect.element(screen.getByLabelText("Email")).toHaveValue("");
    await expect.element(screen.getByLabelText("Mot de passe")).toHaveValue("");
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });

  it("mène à l'inscription", async () => {
    const screen = await renderSignIn(() => Promise.resolve(ok(ADA)));

    await screen.getByRole("link", { name: "Créer un compte" }).click();

    await expect.element(screen.getByText("Page d'inscription")).toBeVisible();
  });
});
