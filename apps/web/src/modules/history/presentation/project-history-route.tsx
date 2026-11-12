import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type {
  HistoryAuthor,
  HistoryEntry,
  HistoryFailure,
  HistoryPage,
} from "../domain/history.ts";

type HistoryReading = Result<HistoryPage, HistoryFailure>;

type Cursor = string | undefined;

type ReadHistory = (project: {
  readonly projectId: string;
  readonly cursor?: string;
}) => Promise<HistoryReading>;

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
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<
    HistoryReading,
    Error,
    InfiniteData<HistoryReading, Cursor>,
    readonly string[],
    Cursor
  >({
    queryKey: ["history", projectId],
    queryFn: ({ pageParam }) => readHistory({ projectId, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.ok ? lastPage.value.nextCursor : lastPageParam,
  });
  const [first, ...older] = data?.pages ?? [];
  if (first === undefined) {
    return <p>Chargement de l'historique…</p>;
  }
  if (!first.ok) {
    return first.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">{READING_MESSAGES[first.error]}</p>
    );
  }
  const last = older.at(-1) ?? first;
  if (!last.ok && last.error === "unauthenticated") {
    return <Navigate to="/connexion" />;
  }
  const entries = [first, ...older].flatMap((page) => (page.ok ? page.value.entries : []));
  const { purgedBefore } = first.value;
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
      {!last.ok && (
        <p role="alert">Les entrées plus anciennes sont indisponibles pour le moment.</p>
      )}
      {hasNextPage && (
        <button type="button" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          Entrées plus anciennes
        </button>
      )}
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
