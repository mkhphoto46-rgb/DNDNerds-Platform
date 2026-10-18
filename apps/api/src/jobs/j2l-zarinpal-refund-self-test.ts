import assert from "node:assert/strict";

import {
  RefundProviderUncertainError,
} from "../providers/contracts/refund-provider.js";

import {
  findRefundProvider,
  listRefundProviders,
} from "../providers/refund/registry.js";

import {
  zarinpalRefundProvider,
} from "../providers/refund/zarinpal.js";

const envKeys =
  [
    "ZARINPAL_ACCESS_TOKEN",
    "ZARINPAL_TERMINAL_ID",
    "ZARINPAL_REFUND_METHOD",
    "ZARINPAL_AMOUNT_DIVISOR",
    "ZARINPAL_GRAPHQL_URL",
  ] as const;

const originalEnv =
  Object.fromEntries(
    envKeys.map(
      key => [
        key,
        process.env[
          key
        ],
      ],
    ),
  ) as
    Record<
      typeof envKeys[number],
      string | undefined
    >;

const originalFetch =
  globalThis.fetch;

let mode:
  | "normal"
  | "ambiguous"
  | "uncertain" =
    "normal";

let addRefundCalls =
  0;

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

const fakeFetch:
  typeof fetch =
  async (
    _input,
    init,
  ) => {
    const headers =
      new Headers(
        init?.headers,
      );

    assert.equal(
      headers.get(
        "Authorization",
      ),
      "Bearer j2l-test-token",
    );

    const bodyText =
      typeof init?.body ===
        "string"
        ? init.body
        : "";

    const payload =
      JSON.parse(
        bodyText,
      ) as {
        query?: string;
        variables?: Record<string, unknown>;
      };

    const query =
      payload.query ??
      "";

    if (
      query.includes(
        "DndResolveRefundSession",
      )
    ) {
      const baseRow = {
        id:
          "session-j2l-1",

        status:
          "PAID",

        amount:
          5000,

        description:
          "DND Nerds order 00000000-0000-4000-8000-000000000001",

        created_at:
          "2026-10-08T00:00:00Z",
      };

      return jsonResponse({
        data: {
          transactions:
            mode ===
              "ambiguous"
              ? [
                  baseRow,
                  {
                    ...baseRow,
                    id:
                      "session-j2l-2",
                  },
                ]
              : [
                  baseRow,
                ],
        },
      });
    }

    if (
      query.includes(
        "DndAddRefund",
      )
    ) {
      addRefundCalls +=
        1;

      if (
        mode ===
        "uncertain"
      ) {
        throw new TypeError(
          "simulated transport loss",
        );
      }

      assert.equal(
        payload.variables
          ?.session_id,
        "session-j2l-1",
      );

      assert.equal(
        payload.variables
          ?.amount,
        5000,
      );

      assert.equal(
        payload.variables
          ?.method,
        "CARD",
      );

      assert.equal(
        payload.variables
          ?.reason,
        "CUSTOMER_REQUEST",
      );

      return jsonResponse({
        data: {
          resource: {
            terminal_id:
              "j2l-terminal",

            id:
              "refund-j2l-provider-1",

            amount:
              5000,

            timeline: {
              refund_amount:
                5000,

              refund_time:
                null,

              refund_status:
                "PROCESSING",
            },
          },
        },
      });
    }

    if (
      query.includes(
        "DndGetRefund",
      )
    ) {
      assert.equal(
        payload.variables
          ?.id,
        "refund-j2l-provider-1",
      );

      return jsonResponse({
        data: {
          refund: {
            id:
              "refund-j2l-provider-1",

            amount:
              5000,

            status:
              "COMPLETED",

            created_at:
              "2026-10-08T00:00:00Z",

            description:
              "test",
          },
        },
      });
    }

    throw new Error(
      "Unexpected GraphQL operation in J2L self-test.",
    );
  };

async function main() {
  process.env
    .ZARINPAL_ACCESS_TOKEN =
      "j2l-test-token";

  process.env
    .ZARINPAL_TERMINAL_ID =
      "j2l-terminal";

  process.env
    .ZARINPAL_REFUND_METHOD =
      "CARD";

  process.env
    .ZARINPAL_AMOUNT_DIVISOR =
      "10";

  delete process.env
    .ZARINPAL_GRAPHQL_URL;

  globalThis.fetch =
    fakeFetch;

  const input = {
    refundId:
      "00000000-0000-4000-8000-000000000002",

    orderId:
      "00000000-0000-4000-8000-000000000001",

    paymentId:
      "00000000-0000-4000-8000-000000000003",

    providerPaymentId:
      "987654321",

    providerIntentId:
      "A00000000000000000000000000000000000",

    providerReference:
      "987654321",

    amountRial:
      50_000,

    currency:
      "IRR",

    idempotencyKey:
      "j2l-refund-test-key",

    reason:
      "J2L test refund",
  };

  assert.ok(
    listRefundProviders()
      .includes(
        "zarinpal",
      ),
  );

  assert.equal(
    findRefundProvider(
      "zarinpal",
    ),
    zarinpalRefundProvider,
  );

  const health =
    await zarinpalRefundProvider
      .healthCheck?.();

  assert.equal(
    health?.configured,
    true,
  );

  mode =
    "normal";

  const created =
    await zarinpalRefundProvider
      .createRefund(
        input,
      );

  assert.equal(
    created.provider,
    "zarinpal",
  );

  assert.equal(
    created.providerRefundId,
    "refund-j2l-provider-1",
  );

  assert.equal(
    created.status,
    "PROCESSING",
  );

  const queried =
    await zarinpalRefundProvider
      .queryRefund?.({
        refundId:
          input.refundId,

        providerRefundId:
          created.providerRefundId,

        amountRial:
          input.amountRial,

        currency:
          input.currency,
      });

  assert.equal(
    queried?.status,
    "SUCCEEDED",
  );

  const beforeAmbiguous =
    addRefundCalls;

  mode =
    "ambiguous";

  await assert.rejects(
    () =>
      zarinpalRefundProvider
        .createRefund(
          input,
        ),
    /ZARINPAL_REFUND_SESSION_AMBIGUOUS/,
  );

  assert.equal(
    addRefundCalls,
    beforeAmbiguous,
  );

  mode =
    "uncertain";

  await assert.rejects(
    () =>
      zarinpalRefundProvider
        .createRefund(
          input,
        ),
    error =>
      error instanceof
        RefundProviderUncertainError &&
      error.code ===
        "ZARINPAL_REFUND_TRANSPORT_UNCERTAIN",
  );

  console.log(
    JSON.stringify(
      {
        registry:
          "PASS",

        sessionResolution:
          "PASS",

        ambiguityFailClosed:
          "PASS",

        createRefund:
          "PASS",

        queryRefund:
          "PASS",

        uncertainOutcome:
          "PASS",

        network:
          "MOCKED",
      },
      null,
      2,
    ),
  );

  console.log(
    "J2L_ZARINPAL_REFUND_SELF_TEST_PASS",
  );
}

main()
  .finally(
    () => {
      globalThis.fetch =
        originalFetch;

      for (
        const key
        of envKeys
      ) {
        const value =
          originalEnv[
            key
          ];

        if (
          value ===
          undefined
        ) {
          delete process.env[
            key
          ];
        }
        else {
          process.env[
            key
          ] =
            value;
        }
      }
    },
  )
  .then(
    () => {
      process.exit(
        0,
      );
    },
  )
  .catch(
    error => {
      console.error(
        error,
      );

      process.exit(
        1,
      );
    },
  );
