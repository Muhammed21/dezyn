import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccessTokenVerifier } from "./index.ts";

const ISSUER = "http://127.0.0.1:3000/auth";
const AUDIENCE = "http://127.0.0.1:3000/v1";
const JWKS_URL = "http://127.0.0.1:3000/auth/jwks";
const MINUTE = 60_000;

type SigningKey = {
  readonly kid: string;
  readonly alg: string;
  readonly privateKey: CryptoKey;
  readonly jwk: JWK;
};

const makeKey = async (kid: string, alg = "EdDSA"): Promise<SigningKey> => {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  return { kid, alg, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg } };
};

const makeJwksServer = (initial: readonly SigningKey[]) => {
  const state = { published: initial, fetches: 0 };
  const fetchJwks = async () => {
    state.fetches += 1;
    return Response.json({ keys: state.published.map(({ jwk }) => jwk) });
  };
  return {
    fetchJwks,
    fetches: () => state.fetches,
    publish: (keys: readonly SigningKey[]) => {
      state.published = keys;
    },
  };
};

const signToken = ({
  key,
  claims = {},
  typ = "at+jwt",
  issuer = ISSUER,
  audience = AUDIENCE,
  expiresIn = "15m",
}: {
  key: SigningKey;
  claims?: Record<string, unknown>;
  typ?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
}) =>
  new SignJWT({
    sub: "user-1",
    sid: "sid-1",
    azp: "client-1",
    scope: "offline_access",
    ...claims,
  })
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key.privateKey);

const makeVerifier = ({ server }: { server: ReturnType<typeof makeJwksServer> }) =>
  createAccessTokenVerifier({
    jwksUrl: JWKS_URL,
    issuer: ISSUER,
    audience: AUDIENCE,
    fetchJwks: server.fetchJwks,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-12T12:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("vérification d'un jeton d'accès (ADR 0018 §1)", () => {
  it("rend l'identité portée par un jeton valide", async () => {
    const key = await makeKey("k1");
    const verifier = makeVerifier({ server: makeJwksServer([key]) });

    expect(await verifier.verify(await signToken({ key }))).toEqual({
      ok: true,
      value: {
        userId: "user-1",
        sid: "sid-1",
        clientId: "client-1",
        scopes: ["offline_access"],
      },
    });
  });

  it("ne lit aucun rôle dans le jeton", async () => {
    const key = await makeKey("k1");
    const verifier = makeVerifier({ server: makeJwksServer([key]) });
    const token = await signToken({
      key,
      claims: { role: "admin", roles: ["owner"], permissions: ["*"] },
    });

    const result = await verifier.verify(token);

    expect(result.ok && Object.keys(result.value).toSorted()).toEqual([
      "clientId",
      "scopes",
      "sid",
      "userId",
    ]);
  });

  it("rend une liste de scopes vide quand le jeton n'en porte pas", async () => {
    const key = await makeKey("k1");
    const verifier = makeVerifier({ server: makeJwksServer([key]) });
    const token = await signToken({ key, claims: { scope: undefined } });

    expect(await verifier.verify(token)).toMatchObject({ ok: true, value: { scopes: [] } });
  });

  it("découpe les scopes séparés par des espaces", async () => {
    const key = await makeKey("k1");
    const verifier = makeVerifier({ server: makeJwksServer([key]) });
    const token = await signToken({ key, claims: { scope: "offline_access mcp:read" } });

    expect(await verifier.verify(token)).toMatchObject({
      ok: true,
      value: { scopes: ["offline_access", "mcp:read"] },
    });
  });

  it.each([
    ["une autre audience", { audience: "http://127.0.0.1:3000/autre" }],
    ["un autre émetteur", { issuer: "http://ailleurs.example/auth" }],
    ["un type autre que at+jwt, comme un ID token", { typ: "JWT" }],
    ["un jeton expiré", { expiresIn: "-1s" }],
    ["un jeton sans sid", { claims: { sid: undefined } }],
    ["un sid qui n'est pas une chaîne", { claims: { sid: 42 } }],
    ["un sub absent", { claims: { sub: undefined } }],
    ["un jeton sans client (azp)", { claims: { azp: undefined } }],
  ])("refuse %s", async (_case, variant) => {
    const key = await makeKey("k1");
    const verifier = makeVerifier({ server: makeJwksServer([key]) });

    expect(await verifier.verify(await signToken({ key, ...variant }))).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });

  it("refuse un jeton signé par une clé que le JWKS ne publie pas", async () => {
    const published = await makeKey("k1");
    const forged = { ...(await makeKey("k1")), kid: "k1" };
    const verifier = makeVerifier({ server: makeJwksServer([published]) });

    expect(await verifier.verify(await signToken({ key: forged }))).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });

  it("refuse un jeton signé avec un autre algorithme qu'EdDSA, même par une clé publiée", async () => {
    const key = await makeKey("k1", "ES256");
    const verifier = makeVerifier({ server: makeJwksServer([key]) });

    expect(await verifier.verify(await signToken({ key }))).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });

  it("refuse ce qui n'est pas un JWT", async () => {
    const verifier = makeVerifier({ server: makeJwksServer([await makeKey("k1")]) });

    expect(await verifier.verify("pas-un-jwt")).toEqual({ ok: false, error: "invalid_token" });
  });
});

describe("cache du JWKS (ADR 0018, risques)", () => {
  it("garde le JWKS en cache pour les jetons d'une clé connue", async () => {
    const key = await makeKey("k1");
    const server = makeJwksServer([key]);
    const verifier = makeVerifier({ server });

    await verifier.verify(await signToken({ key }));
    vi.advanceTimersByTime(9 * MINUTE);
    await verifier.verify(await signToken({ key }));

    expect(server.fetches()).toBe(1);
  });

  it("recharge le JWKS une seule fois pour un kid inconnu, puis accepte la nouvelle clé", async () => {
    const current = await makeKey("k1");
    const next = await makeKey("k2");
    const server = makeJwksServer([current]);
    const verifier = makeVerifier({ server });
    await verifier.verify(await signToken({ key: current }));
    vi.advanceTimersByTime(MINUTE + 1);
    server.publish([current, next]);

    const result = await verifier.verify(await signToken({ key: next }));

    expect(result.ok).toBe(true);
    expect(server.fetches()).toBe(2);
  });

  it("ne recharge pas plus d'une fois par minute pour des kid inconnus", async () => {
    const current = await makeKey("k1");
    const server = makeJwksServer([current]);
    const verifier = makeVerifier({ server });
    await verifier.verify(await signToken({ key: current }));
    vi.advanceTimersByTime(MINUTE - 1000);

    await verifier.verify(await signToken({ key: await makeKey("inconnu-1") }));
    await verifier.verify(await signToken({ key: await makeKey("inconnu-2") }));

    expect(server.fetches()).toBe(1);
  });

  it("recharge le JWKS au-delà de 10 minutes", async () => {
    const key = await makeKey("k1");
    const server = makeJwksServer([key]);
    const verifier = makeVerifier({ server });
    await verifier.verify(await signToken({ key }));
    vi.advanceTimersByTime(10 * MINUTE + 1);

    await verifier.verify(await signToken({ key }));

    expect(server.fetches()).toBe(2);
  });
});
