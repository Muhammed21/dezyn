export interface ProjectLock {
  write(projectId: string): Promise<void>;
  exclusive(projectId: string): Promise<void>;
}
