export type LogRecord = {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly msg: string;
} & Readonly<Record<string, unknown>>;

export type LogSink = (record: LogRecord) => void;

export const errorDetails = (
  error: unknown,
): { readonly error: string; readonly stack?: string | undefined } =>
  error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
