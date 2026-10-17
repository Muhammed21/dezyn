import type { LogSink } from "./logging.ts";

export const createJsonLineSink =
  ({ write, now }: { readonly write: (line: string) => void; readonly now: () => Date }): LogSink =>
  (record) => {
    write(`${JSON.stringify({ time: now().toISOString(), ...record })}\n`);
  };
