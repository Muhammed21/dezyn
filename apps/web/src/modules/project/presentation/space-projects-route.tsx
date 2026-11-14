import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Link, Navigate } from "@tanstack/react-router";
import { type ComponentType, type SubmitEvent, useState } from "react";

import type { Result } from "@repo/result";

import type { ProjectToCreate } from "../application/project-gateway.ts";
import type {
  ListedProject,
  Project,
  ProjectCreationFailure,
  ProjectsFailure,
} from "../domain/project.ts";

type ListProjects = (space: {
  readonly spaceId: string;
}) => Promise<Result<readonly ListedProject[], ProjectsFailure>>;
type CreateProject = (project: ProjectToCreate) => Promise<Result<Project, ProjectCreationFailure>>;
type ReadSpace = (space: {
  readonly spaceId: string;
}) => Promise<Result<{ readonly allowedActions: readonly string[] }, unknown>>;

type InviteMember = ComponentType<{ readonly spaceId: string }>;

const UNKNOWN_SPACE = "Cet espace est introuvable.";

const LISTING_MESSAGES: Readonly<Record<Exclude<ProjectsFailure, "unauthenticated">, string>> = {
  not_found: UNKNOWN_SPACE,
  unavailable: "Les projets sont indisponibles pour le moment.",
  invalid_response: "Les projets sont indisponibles pour le moment.",
};

const CREATION_MESSAGES: Readonly<
  Record<Exclude<ProjectCreationFailure, object | "unauthenticated">, string>
> = {
  invalid_name: "Le nom doit compter de 1 à 100 caractères.",
  forbidden: "Vous n'avez pas le droit de créer un projet dans cet espace.",
  not_found: UNKNOWN_SPACE,
  unavailable: "La création est impossible pour le moment.",
  invalid_response: "La création est impossible pour le moment.",
};

const creationMessageOf = (failure: Exclude<ProjectCreationFailure, "unauthenticated">) => {
  if (typeof failure === "string") {
    return CREATION_MESSAGES[failure];
  }
  return failure.limit === undefined
    ? "Votre plan ne permet pas de créer d'autre projet. Passez au plan Team."
    : `Le plan Free est limité à ${failure.limit} projets. Passez au plan Team pour en créer d'autres.`;
};

const CreateProjectForm = ({
  spaceId,
  createProject,
}: {
  readonly spaceId: string;
  readonly createProject: CreateProject;
}) => {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: createProject,
    onSuccess: async (result) => {
      if (result.ok) {
        setName("");
        await queryClient.invalidateQueries({ queryKey: ["projects", spaceId] });
      }
    },
  });
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutate({ spaceId, name });
  };
  const failure = !isPending && data?.ok === false ? data.error : undefined;
  if (failure === "unauthenticated") {
    return <Navigate to="/connexion" />;
  }
  return (
    <>
      <form onSubmit={onSubmit}>
        <label>
          Nom du projet
          <input
            type="text"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isPending}>
          Créer le projet
        </button>
      </form>
      {failure !== undefined && <p role="alert">{creationMessageOf(failure)}</p>}
    </>
  );
};

const SpaceProjects = ({
  spaceId,
  listProjects,
  createProject,
  readSpace,
  InviteMember,
}: {
  readonly spaceId: string;
  readonly listProjects: ListProjects;
  readonly createProject: CreateProject;
  readonly readSpace: ReadSpace;
  readonly InviteMember: InviteMember;
}) => {
  const { data } = useQuery({
    queryKey: ["projects", spaceId],
    queryFn: () => listProjects({ spaceId }),
  });
  const { data: space } = useQuery({
    queryKey: ["space", spaceId],
    queryFn: () => readSpace({ spaceId }),
  });
  const allowedActions = space?.ok === true ? space.value.allowedActions : [];
  const canCreateProject = allowedActions.includes("project.create");
  const canInviteMember = allowedActions.includes("member.invite");
  if (data === undefined) {
    return <p>Chargement des projets…</p>;
  }
  if (!data.ok) {
    return data.error === "unauthenticated" ? (
      <Navigate to="/connexion" />
    ) : (
      <p role="alert">{LISTING_MESSAGES[data.error]}</p>
    );
  }
  return (
    <main>
      <h1>Projets</h1>
      {data.value.length === 0 ? (
        <p>Aucun projet pour le moment.</p>
      ) : (
        <ul aria-label="Projets">
          {data.value.map((project) => (
            <li key={project.id}>
              <Link to="/projets/$projectId" params={{ projectId: project.id }}>
                {project.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canCreateProject && <CreateProjectForm spaceId={spaceId} createProject={createProject} />}
      {canInviteMember && <InviteMember spaceId={spaceId} />}
    </main>
  );
};

export const spaceProjectsRoute = ({
  parent,
  listProjects,
  createProject,
  readSpace,
  InviteMember,
}: {
  readonly parent: AnyRootRoute;
  readonly listProjects: ListProjects;
  readonly createProject: CreateProject;
  readonly readSpace: ReadSpace;
  readonly InviteMember: InviteMember;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/espaces/$spaceId",
    component: function SpaceProjectsPage() {
      const { spaceId } = route.useParams();
      return (
        <SpaceProjects
          spaceId={spaceId}
          listProjects={listProjects}
          createProject={createProject}
          readSpace={readSpace}
          InviteMember={InviteMember}
        />
      );
    },
  });
  return route;
};
