import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import type { LogRecord } from "./logging.ts";
import { superviseProcess } from "./process-supervision.ts";

const makeHost = () => {
  const events = new EventEmitter();
  const exits: number[] = [];
  return {
    exits,
    emit: (event: string, payload?: unknown) => events.emit(event, payload),
    host: {
      on: (event: string, listener: (payload: unknown) => void) => events.on(event, listener),
      exit: (code: number) => {
        exits.push(code);
      },
    },
  };
};

const makeApi = (close: () => Promise<void> = async () => undefined) => {
  const calls = { close: 0 };
  return {
    calls,
    api: {
      close: () => {
        calls.close += 1;
        return close();
      },
    },
  };
};

const makeLog = () => {
  const records: LogRecord[] = [];
  return { records, log: (record: LogRecord) => records.push(record) };
};

const settle = () =>
  new Promise<void>((done) => {
    setImmediate(done);
  });

const makeGate = () => {
  const gate: { open: () => void } = { open: () => undefined };
  const opened = new Promise<void>((done) => {
    gate.open = done;
  });
  return { opened, open: () => gate.open() };
};

describe("un signal d'arrêt arrête l'API proprement", () => {
  it.each(["SIGTERM", "SIGINT"])("%s ferme l'API puis quitte avec le code 0", async (signal) => {
    const { host, emit, exits } = makeHost();
    const closing = makeGate();
    const { api, calls } = makeApi(() => closing.opened);
    const { log, records } = makeLog();
    superviseProcess({ host, api, log });

    emit(signal);
    await settle();
    const exitsWhileClosing = [...exits];
    closing.open();
    await settle();

    expect(calls.close).toBe(1);
    expect(exitsWhileClosing).toEqual([]);
    expect(exits).toEqual([0]);
    expect(records).toEqual([
      { level: "info", msg: "shutting down", signal },
      { level: "info", msg: "stopped" },
    ]);
  });

  it("un second signal pendant l'arrêt ne ferme pas l'API deux fois", async () => {
    const { host, emit, exits } = makeHost();
    const { api, calls } = makeApi();
    superviseProcess({ host, api, log: makeLog().log });

    emit("SIGTERM");
    emit("SIGINT");
    await settle();

    expect(calls.close).toBe(1);
    expect(exits).toEqual([0]);
  });

  it("un arrêt qui échoue est journalisé et quitte avec le code 1", async () => {
    const { host, emit, exits } = makeHost();
    const { api } = makeApi(() => Promise.reject(new Error("pool déjà fermé")));
    const { log, records } = makeLog();
    superviseProcess({ host, api, log });

    emit("SIGTERM");
    await settle();

    expect(exits).toEqual([1]);
    expect(records.at(-1)).toEqual({
      level: "error",
      msg: "shutdown failed",
      error: "pool déjà fermé",
      stack: expect.any(String),
    });
  });
});

describe("une erreur non attrapée est journalisée, puis le processus s'arrête", () => {
  it.each([
    ["unhandledRejection", "unhandled rejection"],
    ["uncaughtException", "uncaught exception"],
  ])("%s journalise l'erreur et quitte avec le code 1", (event, msg) => {
    const { host, emit, exits } = makeHost();
    const { log, records } = makeLog();
    superviseProcess({ host, api: makeApi().api, log });

    emit(event, new Error("connexion perdue"));

    expect(records).toEqual([
      { level: "error", msg, error: "connexion perdue", stack: expect.any(String) },
    ]);
    expect(exits).toEqual([1]);
  });

  it("une raison qui n'est pas une Error est journalisée telle quelle", () => {
    const { host, emit } = makeHost();
    const { log, records } = makeLog();
    superviseProcess({ host, api: makeApi().api, log });

    emit("unhandledRejection", "délai dépassé");

    expect(records).toEqual([
      { level: "error", msg: "unhandled rejection", error: "délai dépassé" },
    ]);
  });
});
