import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { storageMeterOn } from "#testing/project-storage.ts";

import type { SrgbColor } from "./domain/color.ts";
import type { Token } from "./domain/token.ts";
import { postgresTokenWriter } from "./infrastructure/postgres-tokens.ts";

const UNIQUE_VIOLATION = "23505";

const NIGHT_BLUE: SrgbColor = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const makeToken = (overrides: Partial<Pick<Token, "id" | "name" | "projectId">> = {}): Token => ({
  id: randomUUID(),
  projectId: randomUUID(),
  name: "couleur.fond.primaire",
  $type: "color",
  $value: NIGHT_BLUE,
  status: "validated",
  createdAt: new Date("2026-10-23T09:00:00Z"),
  ...overrides,
});

const createToken = (db: PostgresDatabase, token: Token) =>
  db.orm.transaction((tx) =>
    postgresTokenWriter(tx, { newId: randomUUID, meter: storageMeterOn(tx) }).create(token, [
      { modeId: null, value: NIGHT_BLUE, referencedTokenId: null, fieldReferences: [] },
    ]),
  );

describe("l'écriture d'un token en base", () => {
  it("un nouveau token est créé", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);

      expect(await createToken(db, makeToken({ projectId }))).toBe("created");
    }));

  it("un nom déjà pris dans le projet refuse le token", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const first = makeToken({ projectId });
      await createToken(db, first);

      expect(await createToken(db, makeToken({ projectId, name: first.name }))).toBe("name_taken");
    }));

  it("un identifiant déjà pris n'est pas confondu avec un nom déjà pris", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const first = makeToken({ projectId });
      await createToken(db, first);

      await expect(
        createToken(db, makeToken({ projectId, id: first.id, name: "couleur.fond.second" })),
      ).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
    }));
});
