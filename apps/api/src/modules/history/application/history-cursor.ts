import { z } from "zod";

export type HistoryPosition = { readonly occurredAt: Date; readonly id: string };

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const StoredPosition = z.object({ occurredAt: z.coerce.date(), id: z.uuid() });

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const encodeCursor = ({ occurredAt, id }: HistoryPosition): string =>
  Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id })).toString("base64url");

export const decodeCursor = (cursor: string): HistoryPosition | undefined =>
  BASE64URL.test(cursor)
    ? StoredPosition.safeParse(parseJson(Buffer.from(cursor, "base64url").toString())).data
    : undefined;
