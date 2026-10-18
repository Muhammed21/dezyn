export type HistoryEntryDraft = {
  readonly spaceId: string;
  readonly projectId: string;
  readonly action: string;
  readonly userId: string;
  readonly clientId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly correlationId: string;
  readonly occurredAt: Date;
};

export interface HistoryWriter {
  append(entry: HistoryEntryDraft): Promise<void>;
}
