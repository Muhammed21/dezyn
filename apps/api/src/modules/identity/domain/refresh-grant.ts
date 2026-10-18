const ABSOLUTE_LIFETIME_MS = 180 * 86_400_000;

export type StoredRefreshToken = {
  readonly revoked: Date | null;
  readonly rotationReplayExpiresAt: Date | null;
  readonly authTime: Date | null;
  readonly sessionId: string | null;
};

export type RefreshGrantOutcome = "allowed" | "reuse" | "orphaned" | "expired";

const withinReplayWindow = ({ rotationReplayExpiresAt }: StoredRefreshToken, now: Date) =>
  rotationReplayExpiresAt !== null && rotationReplayExpiresAt.getTime() >= now.getTime();

const isReuse = (token: StoredRefreshToken, now: Date) =>
  token.revoked !== null && !withinReplayWindow(token, now);

const exceedsAbsoluteLifetime = ({ authTime }: StoredRefreshToken, now: Date) =>
  authTime === null || now.getTime() - authTime.getTime() > ABSOLUTE_LIFETIME_MS;

export const refreshGrantOutcome = ({
  token,
  now,
}: {
  readonly token: StoredRefreshToken;
  readonly now: Date;
}): RefreshGrantOutcome => {
  if (isReuse(token, now)) {
    return "reuse";
  }
  if (token.sessionId === null) {
    return "orphaned";
  }
  return exceedsAbsoluteLifetime(token, now) ? "expired" : "allowed";
};
