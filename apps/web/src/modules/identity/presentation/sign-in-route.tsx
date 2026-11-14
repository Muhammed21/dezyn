import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";

import type { Result } from "@repo/result";

import type { SignInFailure } from "../application/identity-gateway.ts";
import { returnPathOf } from "../domain/return-path.ts";
import type { Credentials, Session } from "../domain/session.ts";

type SignIn = (credentials: Credentials) => Promise<Result<Session, SignInFailure>>;

const FAILURE_MESSAGES: Readonly<Record<SignInFailure, string>> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  rate_limited: "Trop de tentatives, réessayez plus tard.",
  unavailable: "La connexion est impossible pour le moment.",
  invalid_response: "La connexion est impossible pour le moment.",
};

const SignInForm = ({
  signIn,
  redirect,
}: {
  readonly signIn: SignIn;
  readonly redirect: string | undefined;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: signIn,
    onSuccess: async (result) => {
      if (result.ok) {
        queryClient.removeQueries();
        await navigate({ to: redirect ?? "/" });
      }
    },
  });
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutate({ email, password });
  };
  return (
    <main>
      <h1>Connexion</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isPending}>
          Se connecter
        </button>
      </form>
      {!isPending && data?.ok === false && <p role="alert">{FAILURE_MESSAGES[data.error]}</p>}
      <Link to="/inscription" search={{ redirect }}>
        Créer un compte
      </Link>
    </main>
  );
};

export const signInRoute = ({
  parent,
  signIn,
}: {
  readonly parent: AnyRootRoute;
  readonly signIn: SignIn;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/connexion",
    validateSearch: (search: Readonly<Record<string, unknown>>) => ({
      redirect: returnPathOf(search["redirect"]),
    }),
    component: function SignInFormPage() {
      return <SignInForm signIn={signIn} redirect={route.useSearch().redirect} />;
    },
  });
  return route;
};
