import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type {
  Batch,
  BatchState,
  Decision,
  Proposal,
  ProposalFailure,
  ProposalKind,
  ProposalStatus,
  ReviewedProposal,
  ReviewFailure,
} from "../domain/proposal.ts";

type ReadBatch = (batch: { readonly batchId: string }) => Promise<Result<Batch, ProposalFailure>>;

type ReviewProposal = (review: {
  readonly proposalId: string;
  readonly decision: Decision;
}) => Promise<Result<ReviewedProposal, ReviewFailure>>;

type OnReviewed = (project: { readonly projectId: string }) => Promise<unknown>;

type Review = {
  readonly reviewProposal: ReviewProposal;
  readonly onReviewed: OnReviewed;
};

const REVIEW_MESSAGES: Readonly<
  Record<Exclude<ReviewFailure, "unauthenticated" | { readonly reason: string }>, string>
> = {
  already_reviewed: "Cette proposition a déjà été relue.",
  not_found: "Cette proposition est introuvable.",
  unavailable: "La relecture est indisponible pour le moment.",
  invalid_response: "La relecture est indisponible pour le moment.",
};

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

const ReviewRefusal = ({ failure }: { readonly failure: ReviewFailure }) => {
  if (failure === "unauthenticated") {
    return <Navigate to="/connexion" />;
  }
  if (typeof failure === "string") {
    return <p role="alert">{REVIEW_MESSAGES[failure]}</p>;
  }
  return (
    <div role="alert">
      <p>Cette proposition est invalide :</p>
      <ul>
        {failure.errors.map(({ path, message }) => (
          <li key={`${path}:${message}`}>
            {path} : {message}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ProposalItem = ({
  proposal,
  batchId,
  projectId,
  review: { reviewProposal, onReviewed },
}: {
  readonly proposal: Proposal;
  readonly batchId: string;
  readonly projectId: string;
  readonly review: Review;
}) => {
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: reviewProposal,
    onSuccess: async (result) => {
      if (result.ok || result.error === "already_reviewed") {
        await Promise.all([
          onReviewed({ projectId }),
          queryClient.invalidateQueries({ queryKey: ["proposal-batch", batchId] }),
          queryClient.invalidateQueries({ queryKey: ["proposal-batches", projectId] }),
        ]);
      }
    },
  });
  const decide = (decision: Decision) => () => mutate({ proposalId: proposal.id, decision });
  return (
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
      {proposal.status === "proposed" ? (
        <>
          <button type="button" disabled={isPending} onClick={decide("validate")}>
            Valider
          </button>
          <button type="button" disabled={isPending} onClick={decide("reject")}>
            Rejeter
          </button>
        </>
      ) : null}
      {!isPending && data?.ok === false ? <ReviewRefusal failure={data.error} /> : null}
    </li>
  );
};

const ProposalBatch = ({
  batchId,
  readBatch,
  review,
}: {
  readonly batchId: string;
  readonly readBatch: ReadBatch;
  readonly review: Review;
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
          <ProposalItem
            key={proposal.id}
            proposal={proposal}
            batchId={batchId}
            projectId={projectId}
            review={review}
          />
        ))}
      </ul>
    </main>
  );
};

export const proposalBatchRoute = ({
  parent,
  readBatch,
  reviewProposal,
  onReviewed,
}: {
  readonly parent: AnyRootRoute;
  readonly readBatch: ReadBatch;
  readonly reviewProposal: ReviewProposal;
  readonly onReviewed: OnReviewed;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/lots/$batchId",
    component: function ProposalBatchPage() {
      const { batchId } = route.useParams();
      return (
        <ProposalBatch
          batchId={batchId}
          readBatch={readBatch}
          review={{ reviewProposal, onReviewed }}
        />
      );
    },
  });
  return route;
};
