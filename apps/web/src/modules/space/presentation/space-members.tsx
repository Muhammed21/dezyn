import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type { MembersFailure, Role, SpaceMember } from "../domain/space.ts";

type ListMembers = (space: {
  readonly spaceId: string;
}) => Promise<Result<readonly SpaceMember[], MembersFailure>>;

const UNAVAILABLE = "Les membres sont indisponibles pour le moment.";

const MEMBERS_MESSAGES: Readonly<Record<Exclude<MembersFailure, "unauthenticated">, string>> = {
  not_found: "Cet espace est introuvable.",
  unavailable: UNAVAILABLE,
  invalid_response: UNAVAILABLE,
};

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  owner: "Propriétaire",
  editor: "Éditeur",
  unknown: "Rôle inconnu",
};

const Members = ({
  members,
}: {
  readonly members: Result<readonly SpaceMember[], MembersFailure> | undefined;
}) => {
  if (members === undefined) {
    return <p>Chargement des membres…</p>;
  }
  if (!members.ok) {
    return members.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">{MEMBERS_MESSAGES[members.error]}</p>
    );
  }
  return (
    <ul aria-label="Membres">
      {members.value.map((member) => (
        <li key={member.userId}>
          {member.name} · {member.email} · {ROLE_LABELS[member.role]}
        </li>
      ))}
    </ul>
  );
};

export const spaceMembers = ({ listMembers }: { readonly listMembers: ListMembers }) =>
  function SpaceMembers({ spaceId }: { readonly spaceId: string }) {
    const { data } = useQuery({
      queryKey: ["members", spaceId],
      queryFn: () => listMembers({ spaceId }),
    });
    return (
      <section aria-labelledby="membres">
        <h2 id="membres">Membres</h2>
        <Members members={data} />
      </section>
    );
  };
