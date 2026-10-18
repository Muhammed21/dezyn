export type Project = {
  readonly id: string;
  readonly spaceId: string;
  readonly name: string;
  readonly createdAt: Date;
};

export type ProjectRef = { readonly id: string; readonly spaceId: string };

export interface ProjectFinder {
  find(projectId: string): Promise<ProjectRef | undefined>;
}
