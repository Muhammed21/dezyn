import { useQuery } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type {
  Batch,
  BatchState,
  Proposal,
  ProposalFailure,
  ProposalKind,
  ProposalStatus,
} from "../domain/proposal.ts";

type ReadBatch = (batch: { readonly batchId: string }) => Promise<Result<Batch, ProposalFailure>>;

const READING_MESSAGES: Readonly<Record<Exclude<ProposalFailure, "unauthenticated">, string>> = {
  not_found: "Ce lot est introuvable.",
  unavailable: "Ce lot est indisponible pour le moment.",
  invalid_response: "Ce lot est indisponible pour le moment.",
};

const STATE_LABELS: Readonly<Record<BatchState, string>> = {
  open: "Ouvert",
  closed: "Fermé",
  unknown: "état inconnu",
};

const KIND_LABELS: Readonly<Record<ProposalKind, string>> = {
  create: "Création",
  update: "Modification",
  unknown: "nature inconnue",
};

const STATUS_LABELS: Readonly<Record<ProposalStatus, string>> = {
  proposed: "Proposée",
  validated: "Validée",
  rejected: "Rejetée",
  replaced: "Remplacée",
  unknown: "statut inconnu",
};

const ProposalItem = ({ proposal }: { readonly proposal: Proposal }) => (
  <li>
    <p>{proposal.name}</p>
    <p>{KIND_LABELS[proposal.kind]}</p>
    <p>{STATUS_LABELS[proposal.status]}</p>
    <p>Proposée : {JSON.stringify(proposal.proposed)}</p>
    {proposal.validated === undefined ? (
      <p>Aucune valeur validée</p>
    ) : (
      <p>Validée : {JSON.stringify(proposal.validated)}</p>
    )}
  </li>
);

const ProposalBatch = ({
  batchId,
  readBatch,
}: {
  readonly batchId: string;
  readonly readBatch: ReadBatch;
}) => {
  const { data } = useQuery({
    queryKey: ["proposal-batch", batchId],
    queryFn: () => readBatch({ batchId }),
  });
  if (data === undefined) {
    return <p>Chargement du lot…</p>;
  }
  if (!data.ok) {
    return data.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">{READING_MESSAGES[data.error]}</p>
    );
  }
  const { projectId, intent, state, proposals } = data.value;
  return (
    <main>
      <h1>{intent ?? "Sans intention"}</h1>
      <p>{STATE_LABELS[state]}</p>
      <Link to="/projets/$projectId" params={{ projectId }}>
        Tokens du projet
      </Link>
      <ul aria-label="Propositions du lot">
        {proposals.map((proposal) => (
          <ProposalItem key={proposal.id} proposal={proposal} />
        ))}
      </ul>
    </main>
  );
};

export const proposalBatchRoute = ({
  parent,
  readBatch,
}: {
  readonly parent: AnyRootRoute;
  readonly readBatch: ReadBatch;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/lots/$batchId",
    component: function ProposalBatchPage() {
      const { batchId } = route.useParams();
      return <ProposalBatch batchId={batchId} readBatch={readBatch} />;
    },
  });
  return route;
};
