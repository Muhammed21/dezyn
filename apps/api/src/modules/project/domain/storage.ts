const encoder = new TextEncoder();

export const storedSize = (row: object): number => encoder.encode(JSON.stringify(row)).length;

export interface StorageMeter {
  add(projectId: string, rows: readonly object[]): Promise<void>;
  remove(projectId: string, rows: readonly object[]): Promise<void>;
}
