export type PayoutProviderStatus =
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export type PayoutCreateInput = {
  payoutId: string;
  storeId: string;
  amountRial: number;
  idempotencyKey: string;
  destination: Record<string, unknown>;
};

export type PayoutCreateResult = {
  provider: string;
  providerReference: string;
  status: PayoutProviderStatus;
  metadata?: Record<string, unknown>;
};

export type PayoutQueryInput = {
  payoutId: string;
  storeId: string;
  amountRial: number;
  providerReference: string;
};

export type PayoutQueryResult = {
  provider: string;
  providerReference: string;
  status: PayoutProviderStatus;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
};

export interface PayoutProvider {
  readonly key: string;

  createPayout(
    input: PayoutCreateInput,
  ): Promise<PayoutCreateResult>;

  queryPayout?(
    input: PayoutQueryInput,
  ): Promise<PayoutQueryResult>;

  healthCheck?(): Promise<{
    configured: boolean;
    healthy: boolean;
    message: string;
  }>;
}
