import { useQuery } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, Navigate } from "@tanstack/react-router";
import type { ComponentType } from "react";

import type { Result } from "@repo/result";

import type { ProjectTokens, Token, TokensFailure } from "../domain/token.ts";

type ReadTokens = (project: {
  readonly projectId: string;
}) => Promise<Result<ProjectTokens, TokensFailure>>;

type ProjectProposals = ComponentType<{ readonly projectId: string }>;

const READING_MESSAGES: Readonly<Record<Exclude<TokensFailure, "unauthenticated">, string>> = {
  not_found: "Ce projet est introuvable.",
  unavailable: "Les tokens sont indisponibles pour le moment.",
  invalid_response: "Les tokens sont indisponibles pour le moment.",
};

const TokenValue = ({
  token,
  modes,
}: {
  readonly token: Token;
  readonly modes: readonly string[];
}) => {
  if (token.value.kind === "single") {
    return <p>{JSON.stringify(token.value.value)}</p>;
  }
  const { values } = token.value;
  return (
    <ul aria-label={`Valeurs de ${token.name}`}>
      {modes.map((mode) => (
        <li key={mode}>
          {mode} : {JSON.stringify(values[mode])}
        </li>
      ))}
    </ul>
  );
};

const ProjectTokensList = ({
  projectId,
  readTokens,
  ProjectProposals,
}: {
  readonly projectId: string;
  readonly readTokens: ReadTokens;
  readonly ProjectProposals: ProjectProposals;
}) => {
  const { data } = useQuery({
    queryKey: ["tokens", projectId],
    queryFn: () => readTokens({ projectId }),
  });
  if (data === undefined) {
    return <p>Chargement des tokens…</p>;
  }
  if (!data.ok) {
    return data.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">{READING_MESSAGES[data.error]}</p>
    );
  }
  const { modes, tokens } = data.value;
  return (
    <main>
      <h1>Tokens</h1>
      <Link to="/projets/$projectId/historique" params={{ projectId }}>
        Historique
      </Link>
      {tokens.length === 0 ? (
        <p>Aucun token pour le moment.</p>
      ) : (
        <ul aria-label="Tokens">
          {tokens.map((token) => (
            <li key={token.id}>
              <p>{token.name}</p>
              <p>{token.type === "unknown" ? "type inconnu" : token.type}</p>
              <TokenValue token={token} modes={modes} />
              <p>{token.description}</p>
            </li>
          ))}
        </ul>
      )}
      <ProjectProposals projectId={projectId} />
    </main>
  );
};

export const projectTokensRoute = ({
  parent,
  readTokens,
  ProjectProposals,
}: {
  readonly parent: AnyRootRoute;
  readonly readTokens: ReadTokens;
  readonly ProjectProposals: ProjectProposals;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/projets/$projectId",
    component: function ProjectTokensPage() {
      const { projectId } = route.useParams();
      return (
        <ProjectTokensList
          projectId={projectId}
          readTokens={readTokens}
          ProjectProposals={ProjectProposals}
        />
      );
    },
  });
  return route;
};
