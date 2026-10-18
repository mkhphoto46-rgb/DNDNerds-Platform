# DND Nerds — Production Provider Setup

## Email

Production email adapter is SMTP.

Set:

- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `PUBLIC_APP_URL`

Liara Mail can be used through its SMTP credentials. Do not commit SMTP passwords.

## ZarinPal payment adapter

The adapter implements the v4 request and verify endpoints and a StartPay redirect URL.

Set:

- `ZARINPAL_MERCHANT_ID`
- `ZARINPAL_API_BASE=https://api.zarinpal.com`
- `ZARINPAL_STARTPAY_BASE=https://www.zarinpal.com/pg/StartPay`
- `ZARINPAL_AMOUNT_DIVISOR=10`

The platform ledger stores IRR. The divisor is explicit so the gateway amount conversion is visible and auditable.

The adapter is contract-tested locally. It is not activated for live customer checkout until merchant credentials and the final public HTTPS callback URL exist.

## Seller payout

Current payout architecture remains provider-abstracted. Do not hard-code an undocumented bank-transfer API.

Before live seller payouts:

1. Choose the contracted payout provider.
2. Obtain its current API documentation and production credentials.
3. Implement that provider behind the existing `PayoutProvider` interface.
4. Run idempotency, retry, timeout, reconciliation, and duplicate-transfer tests.
5. Keep the existing admin approval and double-entry ledger state machine.

## Secrets

Provider credentials belong in deployment secrets/environment configuration, never in source control or frontend code.