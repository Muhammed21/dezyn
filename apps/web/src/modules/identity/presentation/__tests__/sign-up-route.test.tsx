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

import type { SignUpFailure } from "../../application/identity-gateway.ts";
import type { Registration, Session } from "../../domain/session.ts";
import { signUpRoute } from "../sign-up-route.tsx";

const ADA: Session = { userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", email: "ada@dezyn.test" };

type SignUp = (registration: Registration) => Promise<Result<Session, SignUpFailure>>;

const SignInPage = () => {
  const href = useRouterState({ select: (state) => state.location.href });
  return <p>Page de connexion {href}</p>;
};

const renderSignUp = (
  signUp: SignUp,
  queryClient: QueryClient = new QueryClient(),
  at = "/inscription",
) => {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>Accueil</p>,
  });
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: SignInPage,
  });
  const invitation = createRoute({
    getParentRoute: () => root,
    path: "/invitations/$token",
    component: function InvitationPage() {
      return <p>Page de l'invitation {invitation.useParams().token}</p>;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([signUpRoute({ parent: root, signUp }), home, signIn, invitation]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const REGISTRATION: Registration = {
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  password: "un-mot-de-passe-solide",
};

const submit = async (
  screen: Awaited<ReturnType<typeof renderSignUp>>,
  { name, email, password }: Registration,
) => {
  await screen.getByLabelText("Nom").fill(name);
  await screen.getByLabelText("Email").fill(email);
  await screen.getByLabelText("Mot de passe").fill(password);
  await screen.getByRole("button", { name: "Créer mon compte" }).click();
};

const pending = <T,>(): Promise<T> => new Promise<T>(() => {});

describe("page d'inscription (ADR 0044 §7)", () => {
  it("inscrit le visiteur avec ses informations puis l'emmène à l'accueil", async () => {
    const received: Registration[] = [];
    const screen = await renderSignUp((registration) => {
      received.push(registration);
      return Promise.resolve(ok(ADA));
    });

    await submit(screen, REGISTRATION);

    await expect.element(screen.getByText("Accueil")).toBeVisible();
    expect(received).toEqual([REGISTRATION]);
  });

  it("oublie les données lues avant l'inscription", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["my-spaces"], err("unauthenticated"));
    const screen = await renderSignUp(() => Promise.resolve(ok(ADA)), queryClient);

    await submit(screen, REGISTRATION);

    await expect.element(screen.getByText("Accueil")).toBeVisible();
    expect(queryClient.getQueryData(["my-spaces"])).toBeUndefined();
  });

  it.each([
    ["invalid_name", "Indiquez votre nom."],
    ["invalid_email", "L'email n'est pas valide."],
    ["invalid_password", "Le mot de passe doit compter de 8 à 128 caractères."],
    ["email_taken", "Un compte existe déjà avec cet email."],
    ["rate_limited", "Trop de tentatives, réessayez plus tard."],
    ["unavailable", "L'inscription est impossible pour le moment."],
    ["invalid_response", "L'inscription est impossible pour le moment."],
  ] as const)("sur %s, reste sur la page et l'annonce", async (failure, message) => {
    const screen = await renderSignUp(() => Promise.resolve(err(failure)));

    await submit(screen, REGISTRATION);

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    await expect.element(screen.getByRole("heading", { name: "Inscription" })).toBeVisible();
  });

  it("ne relance pas l'inscription tant que la précédente est en cours", async () => {
    const received: Registration[] = [];
    const screen = await renderSignUp((registration) => {
      received.push(registration);
      return pending();
    });

    await submit(screen, REGISTRATION);

    await expect.element(screen.getByRole("button", { name: "Créer mon compte" })).toBeDisabled();
    expect(received).toHaveLength(1);
  });

  it("retire l'ancien message d'échec pendant une nouvelle tentative", async () => {
    const answers: readonly Promise<Result<Session, SignUpFailure>>[] = [
      Promise.resolve(err("email_taken")),
      pending(),
    ];
    const attempts = { count: 0 };
    const screen = await renderSignUp(() => {
      const answer = answers[attempts.count] ?? pending();
      attempts.count += 1;
      return answer;
    });
    await submit(screen, REGISTRATION);
    await expect.element(screen.getByRole("alert")).toBeVisible();

    await screen.getByRole("button", { name: "Créer mon compte" }).click();

    await expect.element(screen.getByRole("button", { name: "Créer mon compte" })).toBeDisabled();
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });

  it("s'ouvre sur un formulaire vide, sans erreur annoncée", async () => {
    const screen = await renderSignUp(() => Promise.resolve(ok(ADA)));

    await expect.element(screen.getByLabelText("Nom")).toHaveValue("");
    await expect.element(screen.getByLabelText("Email")).toHaveValue("");
    await expect.element(screen.getByLabelText("Mot de passe")).toHaveValue("");
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });

  it("mène à la connexion", async () => {
    const screen = await renderSignUp(() => Promise.resolve(ok(ADA)));

    await screen.getByRole("link", { name: "Se connecter" }).click();

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});

const INVITATION = "/invitations/q3Zt8kV0yXlN2mB7cR4wE1sD6fG9hJ5aL0pO3iU8tYk";

describe("retour après l'inscription (ADR 0044 §7)", () => {
  it("mène au chemin interne de l'adresse de retour", async () => {
    const screen = await renderSignUp(
      () => Promise.resolve(ok(ADA)),
      new QueryClient(),
      `/inscription?redirect=${encodeURIComponent(INVITATION)}`,
    );

    await submit(screen, REGISTRATION);

    await expect
      .element(screen.getByText("Page de l'invitation q3Zt8kV0yXlN2mB7cR4wE1sD6fG9hJ5aL0pO3iU8tYk"))
      .toBeVisible();
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "invitations", ""])(
    "ignore l'adresse de retour %j et mène à l'accueil",
    async (redirect) => {
      const screen = await renderSignUp(
        () => Promise.resolve(ok(ADA)),
        new QueryClient(),
        `/inscription?redirect=${encodeURIComponent(redirect)}`,
      );

      await submit(screen, REGISTRATION);

      await expect.element(screen.getByText("Accueil")).toBeVisible();
    },
  );

  it("transmet l'adresse de retour à la connexion", async () => {
    const screen = await renderSignUp(
      () => Promise.resolve(ok(ADA)),
      new QueryClient(),
      `/inscription?redirect=${encodeURIComponent(INVITATION)}`,
    );

    await screen.getByRole("link", { name: "Se connecter" }).click();

    await expect
      .element(screen.getByText(/^Page de connexion/))
      .toHaveTextContent(`/connexion?redirect=${encodeURIComponent(INVITATION)}`);
  });

  it("sans adresse de retour, mène à la connexion sans paramètre", async () => {
    const screen = await renderSignUp(() => Promise.resolve(ok(ADA)));

    await screen.getByRole("link", { name: "Se connecter" }).click();

    await expect
      .element(screen.getByText(/^Page de connexion/))
      .toHaveTextContent("Page de connexion /connexion");
    expect(screen.getByText(/redirect/).elements()).toHaveLength(0);
  });
});
