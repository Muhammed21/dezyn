const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isHttpLoopback = (uri: unknown): boolean => {
  if (typeof uri !== "string" || !URL.canParse(uri)) {
    return false;
  }
  const url = new URL(uri);
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
};

export const defaultToNativeForLoopback = (body: unknown): unknown => {
  if (!isRecord(body) || body["application_type"] !== undefined) {
    return body;
  }
  const redirectUris = body["redirect_uris"];
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every(isHttpLoopback)
  ) {
    return body;
  }
  return { ...body, application_type: "native" };
};
