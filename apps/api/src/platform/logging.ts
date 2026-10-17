export type LogRecord = { readonly level: "info" | "error"; readonly msg: string } & Readonly<
  Record<string, unknown>
>;

export type LogSink = (record: LogRecord) => void;

export const errorDetails = (
  error: Error,
): { readonly error: string; readonly stack?: string | undefined } => ({
  error: error.message,
  stack: error.stack,
});
