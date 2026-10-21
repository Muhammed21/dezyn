import { bench, describe } from "vitest";

import { callMcp, type IdentityApp, startIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";

const TOKEN_COUNT = 130;

const indexes = Array.from({ length: TOKEN_COUNT }, (_, index) => index);

const makeColorOf = (seed: number) => {
  const channels = [16, 8, 0].map((shift) => ((seed % 0xffffff) >> shift) & 0xff);
  return {
    colorSpace: "srgb",
    components: channels.map((channel) => channel / 255),
    alpha: 1,
    hex: `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
  };
};

const makePaletteTokens = (offset: number) =>
  indexes.map((index) =>
    makeColorToken({ name: `couleur.palette.${index}`, $value: makeColorOf(index + offset) }),
  );

type OpenProject = {
  readonly opened: IdentityApp;
  readonly accessToken: string;
  readonly projectId: string;
};

const openProject = async (): Promise<OpenProject> => {
  const opened = await startIdentityApp();
  const seeded = await seedProject(opened.app, opened.db);
  await makePaletteTokens(0).reduce(async (previous, token) => {
    await previous;
    const added = await addToken(opened.app, { ...seeded, token });
    if (added.status !== 201) {
      throw new Error(`Token du bench refusé : ${await added.text()}`);
    }
  }, Promise.resolve());
  return { opened, accessToken: seeded.accessToken, projectId: seeded.projectId };
};

const callTool = async (
  { opened, accessToken }: OpenProject,
  { name, args }: { readonly name: string; readonly args: object },
) => {
  const response = await callMcp(opened.app, {
    token: accessToken,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const body = await response.json();
  if (response.status !== 200 || body.result === undefined || body.result.isError === true) {
    throw new Error(`${name} a échoué : ${JSON.stringify(body)}`);
  }
};

const projectBench = (
  name: string,
  run: (project: OpenProject, round: number) => Promise<void>,
) => {
  const fixture: { project?: OpenProject; round: number } = { round: 0 };
  bench(
    name,
    () => {
      fixture.round += 1;
      if (fixture.project === undefined) {
        throw new Error("Le projet du bench n'est pas ouvert");
      }
      return run(fixture.project, fixture.round);
    },
    {
      setup: async (_task, mode) => {
        if (mode === "warmup") {
          fixture.project = await openProject();
        }
      },
      teardown: async (_task, mode) => {
        if (mode === "run") {
          await fixture.project?.opened.close();
        }
      },
    },
  );
};

describe(`/v1/mcp sur un projet de ${TOKEN_COUNT} tokens`, () => {
  projectBench("read_tokens", (project) =>
    callTool(project, { name: "read_tokens", args: { projectId: project.projectId } }),
  );

  projectBench("write_tokens, une proposition par token", (project, round) =>
    callTool(project, {
      name: "write_tokens",
      args: { projectId: project.projectId, tokens: makePaletteTokens(round * TOKEN_COUNT) },
    }),
  );
});
