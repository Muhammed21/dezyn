export type Project = {
  readonly id: string;
  readonly spaceId: string;
  readonly name: string;
  readonly createdAt: Date;
};

export type PlanRequired = { readonly reason: "plan_required"; readonly limit: number | undefined };

export type ProjectCreationFailure =
  | "unauthenticated"
  | "not_found"
  | "forbidden"
  | "invalid_name"
  | "unavailable"
  | "invalid_response"
  | PlanRequired;

export type ListedProject = Project & { readonly historyPurgedAt: Date | undefined };

export type ProjectsFailure = "unauthenticated" | "not_found" | "unavailable" | "invalid_response";
