import type { Result } from "@repo/result";

export type OutgoingEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export interface Mailer {
  send(email: OutgoingEmail): Promise<Result<undefined, "mail_unavailable">>;
}
