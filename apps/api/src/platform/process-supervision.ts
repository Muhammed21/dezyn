import { errorDetails, type LogSink } from "./logging.ts";

type HostEvent = "SIGTERM" | "SIGINT" | "unhandledRejection" | "uncaughtException";

export type Host = {
  readonly on: (event: HostEvent, listener: (payload: unknown) => void) => unknown;
  readonly exit: (code: number) => void;
};

const SIGNALS = ["SIGTERM", "SIGINT"] as const;

export const superviseProcess = ({
  host,
  api,
  log,
}: {
  readonly host: Host;
  readonly api: { readonly close: () => Promise<void> };
  readonly log: LogSink;
}) => {
  const state = { stopping: false };
  const stop = async (signal: string) => {
    if (state.stopping) {
      log({ level: "warn", msg: "forced exit", signal });
      host.exit(1);
      return;
    }
    state.stopping = true;
    log({ level: "info", msg: "shutting down", signal });
    try {
      await api.close();
    } catch (error) {
      log({ level: "error", msg: "shutdown failed", ...errorDetails(error) });
      host.exit(1);
      return;
    }
    log({ level: "info", msg: "stopped" });
    host.exit(0);
  };
  const crash = (msg: string) => (reason: unknown) => {
    log({ level: "error", msg, ...errorDetails(reason) });
    host.exit(1);
  };

  SIGNALS.forEach((signal) =>
    host.on(signal, () => {
      void stop(signal);
    }),
  );
  host.on("unhandledRejection", crash("unhandled rejection"));
  host.on("uncaughtException", crash("uncaught exception"));
};
