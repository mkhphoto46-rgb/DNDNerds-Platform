export type RefundProviderStatus =
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export class RefundProviderUncertainError
  extends Error {
  public readonly code:
    string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "RefundProviderUncertainError";

    this.code =
      code;
  }
}

export type RefundCreateInput = {
  refundId: string;
  orderId: string;
  paymentId: string;
  providerPaymentId: string;
  providerIntentId?: string | null;
  providerReference?: string | null;
  amountRial: number;
  currency: string;
  idempotencyKey: string;
  reason: string;
};

export type RefundCreateResult = {
  provider: string;
  providerRefundId: string;
  status: RefundProviderStatus;
  failureCode?: string | null;
  metadata?: Record<string, unknown>;
};

export type RefundQueryInput = {
  refundId: string;
  providerRefundId: string;
  amountRial: number;
  currency: string;
};

export type RefundQueryResult = {
  provider: string;
  providerRefundId: string;
  status: RefundProviderStatus;
  failureCode?: string | null;
  metadata?: Record<string, unknown>;
};

export interface RefundProvider {
  readonly key: string;
  readonly capabilities: { readonly partialRefund: boolean };

  createRefund(
    input: RefundCreateInput,
  ): Promise<RefundCreateResult>;

  queryRefund?(
    input: RefundQueryInput,
  ): Promise<RefundQueryResult>;

  healthCheck?(): Promise<{
    configured: boolean;
    healthy: boolean;
    message: string;
  }>;
}
