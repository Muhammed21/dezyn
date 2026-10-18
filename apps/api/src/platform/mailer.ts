export type OutgoingEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}
