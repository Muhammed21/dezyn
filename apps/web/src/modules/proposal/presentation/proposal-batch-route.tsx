import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";

import type { Result } from "@repo/result";

import type {
  Batch,
  BatchState,
  BatchValidationFailure,
  Decision,
  Proposal,
  ProposalFailure,
  ProposalKind,
  ProposalStatus,
  ReviewedProposal,
  ReviewFailure,
  ValidatedBatch,
} from "../domain/proposal.ts";

type ReadBatch = (batch: { readonly batchId: string }) => Promise<Result<Batch, ProposalFailure>>;

type ReviewProposal = (review: {
  readonly proposalId: string;
  readonly decision: Decision;
}) => Promise<Result<ReviewedProposal, ReviewFailure>>;

type ValidateBatch = (validation: {
  readonly batchId: string;
  readonly rejected: readonly string[];
}) => Promise<Result<ValidatedBatch, BatchValidationFailure>>;

type OnReviewed = (project: { readonly projectId: string }) => Promise<unknown>;

type Review = {
  readonly reviewProposal: ReviewProposal;
  readonly validateBatch: ValidateBatch;
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

const VALIDATION_MESSAGES: Readonly<
  Record<Exclude<BatchValidationFailure, "unauthenticated" | { readonly reason: string }>, string>
> = {
  batch_open: "Ce lot est encore ouvert : l'IA peut encore y écrire.",
  not_found: "Ce lot est introuvable.",
  unavailable: "La validation du lot est indisponible pour le moment.",
  invalid_response: "La validation du lot est indisponible pour le moment.",
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

const PROPOSAL_PATH = /^proposals\.([^.]+)\.(.+)$/;

const fieldOf = (path: string, proposals: readonly Proposal[]) => {
  const [, id, field] = PROPOSAL_PATH.exec(path) ?? [];
  const proposal = proposals.find((candidate) => candidate.id === id);
  return proposal === undefined ? path : `${proposal.name} · ${field}`;
};

const ValidationRefusal = ({
  failure,
  proposals,
}: {
  readonly failure: BatchValidationFailure;
  readonly proposals: readonly Proposal[];
}) => {
  if (failure === "unauthenticated") {
    return <Navigate to="/connexion" />;
  }
  if (typeof failure === "string") {
    return <p role="alert">{VALIDATION_MESSAGES[failure]}</p>;
  }
  return (
    <div role="alert">
      <p>Ce lot est invalide :</p>
      <ul>
        {failure.errors.map(({ path, message }) => (
          <li key={`${path}:${message}`}>
            {fieldOf(path, proposals)} : {message}
          </li>
        ))}
      </ul>
    </div>
  );
};

const BatchValidation = ({
  batch: { id: batchId, projectId, state, proposals },
  rejected,
  review: { validateBatch, onReviewed },
}: {
  readonly batch: Batch;
  readonly rejected: readonly string[];
  readonly review: Review;
}) => {
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: validateBatch,
    onSuccess: async (result) => {
      if (result.ok) {
        await Promise.all([
          onReviewed({ projectId }),
          queryClient.invalidateQueries({ queryKey: ["proposal-batch", batchId] }),
          queryClient.invalidateQueries({ queryKey: ["proposal-batches", projectId] }),
        ]);
      }
      if (!result.ok && result.error === "batch_open") {
        await queryClient.invalidateQueries({ queryKey: ["proposal-batch", batchId] });
      }
    },
  });
  const validatable =
    state === "closed" && proposals.some((proposal) => proposal.status === "proposed");
  return (
    <section aria-label="Validation du lot">
      {validatable ? (
        <button type="button" disabled={isPending} onClick={() => mutate({ batchId, rejected })}>
          Valider le lot
        </button>
      ) : null}
      {!isPending && data?.ok === true ? (
        <p>
          Lot validé : {data.value.validated.length} validées, {data.value.rejected.length}{" "}
          rejetées.
        </p>
      ) : null}
      {!isPending && data?.ok === false ? (
        <ValidationRefusal failure={data.error} proposals={proposals} />
      ) : null}
    </section>
  );
};

type Rejection = {
  readonly checked: boolean;
  readonly toggle: () => void;
};

const ProposalItem = ({
  proposal,
  batchId,
  projectId,
  rejection,
  review: { reviewProposal, onReviewed },
}: {
  readonly proposal: Proposal;
  readonly batchId: string;
  readonly projectId: string;
  readonly rejection: Rejection | undefined;
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
      {rejection === undefined ? null : (
        <label>
          <input type="checkbox" checked={rejection.checked} onChange={rejection.toggle} />
          Rejeter dans le lot
        </label>
      )}
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
  const [rejected, setRejected] = useState<readonly string[]>([]);
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
  const rejectionOf = ({ id, status }: Proposal): Rejection | undefined =>
    state === "closed" && status === "proposed"
      ? {
          checked: rejected.includes(id),
          toggle: () =>
            setRejected((current) =>
              current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
            ),
        }
      : undefined;
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
            rejection={rejectionOf(proposal)}
            review={review}
          />
        ))}
      </ul>
      <BatchValidation batch={data.value} rejected={rejected} review={review} />
    </main>
  );
};

export const proposalBatchRoute = ({
  parent,
  readBatch,
  reviewProposal,
  validateBatch,
  onReviewed,
}: {
  readonly parent: AnyRootRoute;
  readonly readBatch: ReadBatch;
  readonly reviewProposal: ReviewProposal;
  readonly validateBatch: ValidateBatch;
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
          review={{ reviewProposal, validateBatch, onReviewed }}
        />
      );
    },
  });
  return route;
};
