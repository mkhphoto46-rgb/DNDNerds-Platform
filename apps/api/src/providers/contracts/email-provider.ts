export type AccountEmailKind =
  | "VERIFY_EMAIL"
  | "PASSWORD_RESET";

export type SendAccountEmailInput = {
  to: string;
  kind: AccountEmailKind;
  token: string;
};

export interface EmailProvider {
  readonly key: string;

  sendAccountEmail(
    input: SendAccountEmailInput,
  ): Promise<{
    provider: string;
    accepted: boolean;
    messageId?: string;
  }>;

  healthCheck?(): Promise<{
    configured: boolean;
    healthy: boolean;
    message: string;
  }>;
}
