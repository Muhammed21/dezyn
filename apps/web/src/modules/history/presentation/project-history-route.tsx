import { useQuery } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type {
  HistoryAuthor,
  HistoryEntry,
  HistoryFailure,
  HistoryPage,
} from "../domain/history.ts";

type ReadHistory = (project: {
  readonly projectId: string;
}) => Promise<Result<HistoryPage, HistoryFailure>>;

const READING_MESSAGES: Readonly<Record<Exclude<HistoryFailure, "unauthenticated">, string>> = {
  not_found: "Ce projet est introuvable.",
  unavailable: "L'historique est indisponible pour le moment.",
  invalid_response: "L'historique est indisponible pour le moment.",
};

const ACTION_LABELS: ReadonlyMap<string, string> = new Map([
  ["project.created", "Projet créé"],
  ["token.created", "Token créé"],
  ["modes.created", "Modes créés"],
  ["proposal.validated", "Proposition validée"],
  ["proposal.rejected", "Proposition rejetée"],
  ["mcp.read_history", "Historique lu par l'IA"],
  ["mcp.read_tokens", "Tokens lus par l'IA"],
  ["mcp.write_tokens", "Tokens écrits par l'IA"],
  ["mcp.open_proposal_batch", "Lot de propositions ouvert par l'IA"],
  ["mcp.close_proposal_batch", "Lot de propositions fermé par l'IA"],
]);

const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

const authorNameOf = (author: HistoryAuthor) => {
  if (author.kind === "unknown") {
    return "auteur inconnu";
  }
  return author.left ? `${author.name} (a quitté l'espace)` : author.name;
};

const Entry = ({ entry }: { readonly entry: HistoryEntry }) => (
  <li>
    <p>{ACTION_LABELS.get(entry.action) ?? entry.action}</p>
    <p>{authorNameOf(entry.author)}</p>
    {entry.clientId !== undefined && <p>via l'IA (client {entry.clientId})</p>}
    <p>{DATE_TIME.format(entry.occurredAt)}</p>
  </li>
);

const ProjectHistory = ({
  projectId,
  readHistory,
}: {
  readonly projectId: string;
  readonly readHistory: ReadHistory;
}) => {
  const { data } = useQuery({
    queryKey: ["history", projectId],
    queryFn: () => readHistory({ projectId }),
  });
  if (data === undefined) {
    return <p>Chargement de l'historique…</p>;
  }
  if (!data.ok) {
    return data.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">{READING_MESSAGES[data.error]}</p>
    );
  }
  const { entries, purgedBefore } = data.value;
  return (
    <main>
      <h1>Historique</h1>
      {purgedBefore !== undefined && (
        <p>Les entrées antérieures au {DATE_TIME.format(purgedBefore)} ont été supprimées.</p>
      )}
      <ul aria-label="Historique">
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </ul>
    </main>
  );
};

export const projectHistoryRoute = ({
  parent,
  readHistory,
}: {
  readonly parent: AnyRootRoute;
  readonly readHistory: ReadHistory;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/projets/$projectId/historique",
    component: function ProjectHistoryPage() {
      const { projectId } = route.useParams();
      return <ProjectHistory projectId={projectId} readHistory={readHistory} />;
    },
  });
  return route;
};
