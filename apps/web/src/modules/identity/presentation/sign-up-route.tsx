import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";

import type { Result } from "@repo/result";

import type { SignUpFailure } from "../application/identity-gateway.ts";
import { returnPathOf } from "../domain/return-path.ts";
import type { Registration, Session } from "../domain/session.ts";

type SignUp = (registration: Registration) => Promise<Result<Session, SignUpFailure>>;

const FAILURE_MESSAGES: Readonly<Record<SignUpFailure, string>> = {
  invalid_name: "Indiquez votre nom.",
  invalid_email: "L'email n'est pas valide.",
  invalid_password: "Le mot de passe doit compter de 8 à 128 caractères.",
  email_taken: "Un compte existe déjà avec cet email.",
  rate_limited: "Trop de tentatives, réessayez plus tard.",
  unavailable: "L'inscription est impossible pour le moment.",
  invalid_response: "L'inscription est impossible pour le moment.",
};

const SignUpForm = ({
  signUp,
  redirect,
}: {
  readonly signUp: SignUp;
  readonly redirect: string | undefined;
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: signUp,
    onSuccess: async (result) => {
      if (result.ok) {
        queryClient.removeQueries();
        await navigate({ to: redirect ?? "/" });
      }
    },
  });
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutate({ name, email, password });
  };
  return (
    <main>
      <h1>Inscription</h1>
      <form onSubmit={onSubmit}>
        <label>
          Nom
          <input
            type="text"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
          Créer mon compte
        </button>
      </form>
      {!isPending && data?.ok === false && <p role="alert">{FAILURE_MESSAGES[data.error]}</p>}
      <Link to="/connexion" search={{ redirect }}>
        Se connecter
      </Link>
    </main>
  );
};

export const signUpRoute = ({
  parent,
  signUp,
}: {
  readonly parent: AnyRootRoute;
  readonly signUp: SignUp;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/inscription",
    validateSearch: (search: Readonly<Record<string, unknown>>) => ({
      redirect: returnPathOf(search["redirect"]),
    }),
    component: function SignUpFormPage() {
      return <SignUpForm signUp={signUp} redirect={route.useSearch().redirect} />;
    },
  });
  return route;
};
