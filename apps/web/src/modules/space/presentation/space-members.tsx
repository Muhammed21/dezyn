import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type {
  AssignableRole,
  ChangedRole,
  MembersFailure,
  Role,
  RoleChangeFailure,
  Space,
  SpaceFailure,
  SpaceMember,
} from "../domain/space.ts";

type ListMembers = (space: {
  readonly spaceId: string;
}) => Promise<Result<readonly SpaceMember[], MembersFailure>>;

type ReadSpace = (space: { readonly spaceId: string }) => Promise<Result<Space, SpaceFailure>>;

type ChangeRole = (change: {
  readonly spaceId: string;
  readonly memberId: string;
  readonly role: AssignableRole;
}) => Promise<Result<ChangedRole, RoleChangeFailure>>;

const UNAVAILABLE = "Les membres sont indisponibles pour le moment.";

const MEMBERS_MESSAGES: Readonly<Record<Exclude<MembersFailure, "unauthenticated">, string>> = {
  not_found: "Cet espace est introuvable.",
  unavailable: UNAVAILABLE,
  invalid_response: UNAVAILABLE,
};

const ROLE_CHANGE_UNAVAILABLE = "Le changement de rôle est indisponible pour le moment.";

const ROLE_CHANGE_MESSAGES: Readonly<
  Record<Exclude<RoleChangeFailure, "unauthenticated">, string>
> = {
  last_owner: "L'espace doit garder au moins un propriétaire.",
  forbidden: "Vous n'avez pas le droit de gérer les membres de cet espace.",
  not_found: "Ce membre est introuvable.",
  unavailable: ROLE_CHANGE_UNAVAILABLE,
  invalid_response: ROLE_CHANGE_UNAVAILABLE,
};

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  owner: "Propriétaire",
  editor: "Éditeur",
  unknown: "Rôle inconnu",
};

const NEXT_ROLES: Readonly<Partial<Record<Role, { role: AssignableRole; label: string }>>> = {
  owner: { role: "editor", label: "Rendre éditeur" },
  editor: { role: "owner", label: "Rendre propriétaire" },
};

const RoleChangeButton = ({
  member,
  changing,
  onChange,
}: {
  readonly member: SpaceMember;
  readonly changing: boolean;
  readonly onChange: (change: { readonly memberId: string; readonly role: AssignableRole }) => void;
}) => {
  const next = NEXT_ROLES[member.role];
  if (next === undefined) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label={`${next.label} ${member.name}`}
      disabled={changing}
      onClick={() => onChange({ memberId: member.userId, role: next.role })}
    >
      {next.label}
    </button>
  );
};

const Members = ({
  members,
  canManage,
  changingMemberId,
  onChange,
}: {
  readonly members: Result<readonly SpaceMember[], MembersFailure> | undefined;
  readonly canManage: boolean;
  readonly changingMemberId: string | undefined;
  readonly onChange: (change: { readonly memberId: string; readonly role: AssignableRole }) => void;
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
          {canManage && (
            <RoleChangeButton
              member={member}
              changing={changingMemberId === member.userId}
              onChange={onChange}
            />
          )}
        </li>
      ))}
    </ul>
  );
};

const RoleChangeOutcome = ({ failure }: { readonly failure: RoleChangeFailure }) =>
  failure === "unauthenticated" ? (
    <Navigate to="/connexion" />
  ) : (
    <p role="alert">{ROLE_CHANGE_MESSAGES[failure]}</p>
  );

export const spaceMembers = ({
  listMembers,
  readSpace,
  changeRole,
}: {
  readonly listMembers: ListMembers;
  readonly readSpace: ReadSpace;
  readonly changeRole: ChangeRole;
}) =>
  function SpaceMembers({ spaceId }: { readonly spaceId: string }) {
    const queryClient = useQueryClient();
    const { data } = useQuery({
      queryKey: ["members", spaceId],
      queryFn: () => listMembers({ spaceId }),
    });
    const { data: space } = useQuery({
      queryKey: ["space", spaceId],
      queryFn: () => readSpace({ spaceId }),
    });
    const {
      data: changed,
      isPending,
      variables,
      mutate,
    } = useMutation({
      mutationFn: changeRole,
      onSuccess: async (result) => {
        if (result.ok) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["members", spaceId] }),
            queryClient.invalidateQueries({ queryKey: ["space", spaceId] }),
            queryClient.invalidateQueries({ queryKey: ["my-spaces"] }),
          ]);
        }
      },
    });
    const canManage = space?.ok === true && space.value.allowedActions.includes("member.manage");
    const failure = !isPending && changed?.ok === false ? changed.error : undefined;
    return (
      <section aria-labelledby="membres">
        <h2 id="membres">Membres</h2>
        <Members
          members={data}
          canManage={canManage}
          changingMemberId={isPending ? variables.memberId : undefined}
          onChange={({ memberId, role }) => mutate({ spaceId, memberId, role })}
        />
        {failure !== undefined && <RoleChangeOutcome failure={failure} />}
      </section>
    );
  };
