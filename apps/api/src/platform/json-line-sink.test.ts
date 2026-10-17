import { describe, expect, it } from "vitest";

import { createJsonLineSink } from "./json-line-sink.ts";

describe("createJsonLineSink", () => {
  it("écrit chaque enregistrement sur une ligne JSON, horodatée", () => {
    const lines: string[] = [];
    const sink = createJsonLineSink({
      write: (line) => lines.push(line),
      now: () => new Date("2026-10-18T09:30:00.000Z"),
    });

    sink({ level: "info", msg: "request", status: 200 });

    expect(lines).toEqual([
      '{"time":"2026-10-18T09:30:00.000Z","level":"info","msg":"request","status":200}\n',
    ]);
  });
});
