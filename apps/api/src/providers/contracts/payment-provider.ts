export type PaymentProviderKey =
  | "mock"
  | "mock-secondary"
  | "zarinpal"
  | (string & {});

export type PaymentProviderCapabilities = {
  createPayment: boolean;
  verifyPayment: boolean;
  refund: boolean;
  partialRefund: boolean;
  webhook: boolean;
  statusQuery: boolean;
};

export type PaymentCreateInput = {
  paymentIntentId: string;
  amountRial: number;
  callbackUrl: string;
  description: string;
  customerEmail?: string;
  customerMobile?: string;
};

export type PaymentCreateResult = {
  provider: string;
  providerIntentId: string;
  redirectUrl: string | null;
  rawStatus: string | null;
  metadata?: Record<string, unknown>;
};

export type PaymentVerifyInput = {
  paymentIntentId: string;
  amountRial: number;
  providerIntentId: string;
  query?: Record<string, string | undefined>;
};

export type PaymentVerifyResult = {
  provider: string;
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  providerReference: string | null;
  failureCode: string | null;
  metadata?: Record<string, unknown>;
};

export type PaymentProviderHealth = {
  configured: boolean;
  healthy: boolean;
  message: string;
};

export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  readonly capabilities: PaymentProviderCapabilities;

  createPayment(
    input: PaymentCreateInput,
  ): Promise<PaymentCreateResult>;

  verifyPayment(
    input: PaymentVerifyInput,
  ): Promise<PaymentVerifyResult>;

  redirectUrlForIntent?(
    providerIntentId: string,
  ): string | null;

  healthCheck?():
    Promise<PaymentProviderHealth>;
}
