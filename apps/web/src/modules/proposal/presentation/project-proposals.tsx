import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type { BatchState, BatchSummary, ProposalFailure } from "../domain/proposal.ts";

type ListBatches = (project: {
  readonly projectId: string;
}) => Promise<Result<readonly BatchSummary[], ProposalFailure>>;

const STATE_LABELS: Readonly<Record<BatchState, string>> = {
  open: "Ouvert",
  closed: "Fermé",
  unknown: "état inconnu",
};

const BatchList = ({ batches }: { readonly batches: readonly BatchSummary[] }) =>
  batches.length === 0 ? (
    <p>Aucune proposition pour le moment.</p>
  ) : (
    <ul aria-label="Lots de propositions">
      {batches.map(({ id, intent, state, toReview }) => (
        <li key={id}>
          <p>
            <Link to="/lots/$batchId" params={{ batchId: id }}>
              {intent ?? "Sans intention"}
            </Link>
          </p>
          <p>{STATE_LABELS[state]}</p>
          <p>{toReview} à relire</p>
        </li>
      ))}
    </ul>
  );

export const projectProposals = ({ listBatches }: { readonly listBatches: ListBatches }) =>
  function ProjectProposals({ projectId }: { readonly projectId: string }) {
    const { data } = useQuery({
      queryKey: ["proposal-batches", projectId],
      queryFn: () => listBatches({ projectId }),
    });
    if (data === undefined) {
      return <p>Chargement des propositions…</p>;
    }
    if (!data.ok) {
      return data.error === "unauthenticated" ? (
        <Navigate to="/connexion" />
      ) : (
        <p role="alert">Les propositions sont indisponibles pour le moment.</p>
      );
    }
    return (
      <section aria-labelledby="propositions">
        <h2 id="propositions">Propositions</h2>
        <BatchList batches={data.value} />
      </section>
    );
  };
