type GraphqlError = {
  message?: string;
  extensions?: {
    code?: unknown;
  };
};

type GraphqlEnvelope<T> = {
  data?: T | null;
  errors?: GraphqlError[];
};

type ZarinpalTransactionRow = {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  description?: unknown;
  created_at?: unknown;
};

type ZarinpalRefundTimeline = {
  refund_amount?: unknown;
  refund_time?: unknown;
  refund_status?: unknown;
};

type ZarinpalRefundResource = {
  terminal_id?: unknown;
  id?: unknown;
  amount?: unknown;
  status?: unknown;
  created_at?: unknown;
  description?: unknown;
  timeline?:
    | ZarinpalRefundTimeline
    | ZarinpalRefundTimeline[]
    | null;
};

export class ZarinpalRefundOutcomeUncertainError
  extends Error {
  public readonly code:
    string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ZarinpalRefundOutcomeUncertainError";

    this.code =
      code;
  }
}

export function resolveZarinpalGraphqlUrl(
  rawOverride =
    process.env
      .ZARINPAL_GRAPHQL_URL,
) {
  const raw =
    (
      rawOverride ??
      "https://next.zarinpal.com/api/v4/graphql/"
    ).trim();

  let parsed:
    URL;

  try {
    parsed =
      new URL(
        raw,
      );
  }
  catch {
    throw new Error(
      "ZARINPAL_GRAPHQL_URL is invalid.",
    );
  }

  if (
    parsed.protocol !==
    "https:"
  ) {
    throw new Error(
      "ZARINPAL_GRAPHQL_URL must use HTTPS.",
    );
  }

  if (
    parsed.hostname
      .toLowerCase() !==
    "next.zarinpal.com"
  ) {
    throw new Error(
      "ZARINPAL_GRAPHQL_URL must use the official next.zarinpal.com host.",
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "ZARINPAL_GRAPHQL_URL contains unsupported URL components.",
    );
  }

  const normalizedPath =
    parsed.pathname
      .replace(
        /\/+$/,
        "",
      );

  if (
    normalizedPath !==
    "/api/v4/graphql"
  ) {
    throw new Error(
      "ZARINPAL_GRAPHQL_URL must use the official /api/v4/graphql/ path.",
    );
  }

  return (
    "https://next.zarinpal.com/api/v4/graphql/"
  );
}

function graphqlUrl() {
  return (
    resolveZarinpalGraphqlUrl()
  );
}

function accessToken() {
  const value =
    process.env
      .ZARINPAL_ACCESS_TOKEN
      ?.trim();

  if (!value) {
    throw new Error(
      "ZARINPAL_ACCESS_TOKEN is required for refunds.",
    );
  }

  return value;
}

function terminalId() {
  const value =
    process.env
      .ZARINPAL_TERMINAL_ID
      ?.trim();

  if (!value) {
    throw new Error(
      "ZARINPAL_TERMINAL_ID is required for refunds.",
    );
  }

  return value;
}

function refundMethod() {
  const value =
    process.env
      .ZARINPAL_REFUND_METHOD
      ?.trim()
      .toUpperCase();

  if (
    value !==
      "CARD" &&
    value !==
      "PAYA"
  ) {
    throw new Error(
      "ZARINPAL_REFUND_METHOD must be CARD or PAYA.",
    );
  }

  return value;
}

function gatewayAmount(
  amountRial: number,
) {
  if (
    !Number.isInteger(
      amountRial,
    ) ||
    amountRial <= 0
  ) {
    throw new Error(
      "amountRial must be a positive integer.",
    );
  }

  const divisor =
    Number.parseInt(
      process.env
        .ZARINPAL_AMOUNT_DIVISOR ??
        "10",
      10,
    );

  if (
    !Number.isInteger(
      divisor,
    ) ||
    divisor <= 0
  ) {
    throw new Error(
      "ZARINPAL_AMOUNT_DIVISOR is invalid.",
    );
  }

  if (
    amountRial %
      divisor !==
    0
  ) {
    throw new Error(
      "IRR amount is not exactly convertible to the configured ZarinPal amount unit.",
    );
  }

  return amountRial /
    divisor;
}

function stringValue(
  value: unknown,
) {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    return normalized ||
      null;
  }

  if (
    typeof value ===
      "number" ||
    typeof value ===
      "bigint"
  ) {
    return String(
      value,
    );
  }

  return null;
}

function numberValue(
  value: unknown,
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      Number(
        value,
      );

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return parsed;
    }
  }

  return null;
}

function graphqlErrorMessage(
  errors:
    GraphqlError[] | undefined,
) {
  const first =
    errors?.[0];

  if (!first) {
    return null;
  }

  const code =
    stringValue(
      first.extensions
        ?.code,
    );

  const message =
    first.message
      ?.trim();

  return [
    code,
    message,
  ]
    .filter(
      Boolean,
    )
    .join(
      ": ",
    ) ||
    "GraphQL request failed.";
}

async function graphqlRequest<T>(
  query: string,
  variables:
    Record<
      string,
      unknown
    >,
  moneyMovement = false,
) {
  let response:
    Response;

  try {
    response =
      await fetch(
        graphqlUrl(),
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            "User-Agent":
              "DND-Nerds/1.0",

            Authorization:
              `Bearer ${accessToken()}`,
          },

          body:
            JSON.stringify({
              query,
              variables,
            }),

          signal:
            AbortSignal.timeout(
              15_000,
            ),
        },
      );
  }
  catch (error) {
    if (moneyMovement) {
      throw new ZarinpalRefundOutcomeUncertainError(
        "ZARINPAL_REFUND_TRANSPORT_UNCERTAIN",
        "ZarinPal refund transport failed after the refund request may have been submitted.",
      );
    }

    throw error;
  }

  const text =
    await response.text();

  let parsed:
    GraphqlEnvelope<T>;

  try {
    parsed =
      JSON.parse(
        text,
      ) as
        GraphqlEnvelope<T>;
  }
  catch {
    if (moneyMovement) {
      throw new ZarinpalRefundOutcomeUncertainError(
        "ZARINPAL_REFUND_RESPONSE_UNCERTAIN",
        "ZarinPal returned an unreadable refund response after the request may have been accepted.",
      );
    }

    throw new Error(
      `ZarinPal GraphQL returned non-JSON HTTP ${response.status}.`,
    );
  }

  if (
    !response.ok
  ) {
    if (
      moneyMovement &&
      response.status >=
        500
    ) {
      throw new ZarinpalRefundOutcomeUncertainError(
        "ZARINPAL_REFUND_HTTP_UNCERTAIN",
        `ZarinPal returned HTTP ${response.status} after the refund request may have been accepted.`,
      );
    }

    throw new Error(
      `ZarinPal GraphQL HTTP ${response.status}: ${
        graphqlErrorMessage(
          parsed.errors,
        ) ??
        "request failed"
      }`,
    );
  }

  const graphError =
    graphqlErrorMessage(
      parsed.errors,
    );

  if (graphError) {
    if (moneyMovement) {
      throw new ZarinpalRefundOutcomeUncertainError(
        "ZARINPAL_REFUND_GRAPHQL_UNCERTAIN",
        `ZarinPal returned a GraphQL error after the refund request may have been accepted: ${graphError}`,
      );
    }

    throw new Error(
      `ZarinPal GraphQL error: ${graphError}`,
    );
  }

  if (!parsed.data) {
    if (moneyMovement) {
      throw new ZarinpalRefundOutcomeUncertainError(
        "ZARINPAL_REFUND_DATA_UNCERTAIN",
        "ZarinPal refund response did not include data after the request may have been accepted.",
      );
    }

    throw new Error(
      "ZarinPal GraphQL response data is missing.",
    );
  }

  return parsed.data;
}

function statusValue(
  value: unknown,
) {
  return (
    stringValue(
      value,
    )
      ?.toUpperCase() ??
    null
  );
}

function mapRefundStatus(
  raw: string | null,
) {
  if (!raw) {
    return "PROCESSING" as const;
  }

  const success =
    [
      "PAID",
      "SUCCESS",
      "SUCCEEDED",
      "DONE",
      "COMPLETED",
    ];

  if (
    success.some(
      token =>
        raw ===
          token ||
        raw.includes(
          token,
        ),
    )
  ) {
    return "SUCCEEDED" as const;
  }

  const failed =
    [
      "FAILED",
      "FAILURE",
      "REJECTED",
      "CANCELLED",
      "CANCELED",
    ];

  if (
    failed.some(
      token =>
        raw ===
          token ||
        raw.includes(
          token,
        ),
    )
  ) {
    return "FAILED" as const;
  }

  return "PROCESSING" as const;
}

function timelineValues(
  resource:
    ZarinpalRefundResource,
) {
  const timeline =
    resource.timeline;

  const rows =
    Array.isArray(
      timeline,
    )
      ? timeline
      : timeline &&
          typeof timeline ===
            "object"
        ? [
            timeline,
          ]
        : [];

  let status:
    string | null =
      null;

  let amount:
    number | null =
      null;

  for (
    const row
    of rows
  ) {
    const nextStatus =
      statusValue(
        row.refund_status,
      );

    if (nextStatus) {
      status =
        nextStatus;
    }

    const nextAmount =
      numberValue(
        row.refund_amount,
      );

    if (
      nextAmount !==
      null
    ) {
      amount =
        nextAmount;
    }
  }

  if (
    status ===
    null
  ) {
    status =
      statusValue(
        resource.status,
      );
  }

  if (
    amount ===
    null
  ) {
    amount =
      numberValue(
        resource.amount,
      );
  }

  return {
    status,
    amount,
  };
}

function normalizeProviderResult(
  providerRefundId: string,
  resource:
    ZarinpalRefundResource,
  expectedAmount: number,
) {
  const values =
    timelineValues(
      resource,
    );

  const mapped =
    mapRefundStatus(
      values.status,
    );

  if (
    mapped ===
      "SUCCEEDED" &&
    values.amount ===
      null
  ) {
    return {
      providerRefundId,
      status:
        "PROCESSING" as const,
      failureCode:
        "ZARINPAL_REFUND_AMOUNT_MISSING",
      providerStatus:
        values.status,
      providerAmount:
        null,
    };
  }

  if (
    mapped ===
      "SUCCEEDED" &&
    values.amount !==
      expectedAmount
  ) {
    return {
      providerRefundId,
      status:
        "PROCESSING" as const,
      failureCode:
        "ZARINPAL_REFUND_AMOUNT_MISMATCH",
      providerStatus:
        values.status,
      providerAmount:
        values.amount,
    };
  }

  return {
    providerRefundId,
    status:
      mapped,
    failureCode:
      null,
    providerStatus:
      values.status,
    providerAmount:
      values.amount,
  };
}

export async function resolveZarinpalRefundSession(
  input: {
    orderId: string;
    amountRial: number;
  },
) {
  const expectedDescription =
    `DND Nerds order ${input.orderId}`;

  const expectedAmount =
    gatewayAmount(
      input.amountRial,
    );

  const query =
    `
      query DndResolveRefundSession(
        $terminal_id: ID!,
        $filter: String,
        $limit: Int,
        $offset: Int
      ) {
        transactions: GetTransactions(
          terminal_id: $terminal_id,
          filter: $filter,
          limit: $limit,
          offset: $offset
        ) {
          id
          status
          amount
          description
          created_at
        }
      }
    `;

  const pageSize =
    50;

  const maxPages =
    20;

  const matches:
    Array<{
      id: string;
      status: string | null;
      amount: number;
      description: string;
    }> = [];

  let exhausted =
    false;

  for (
    let page = 0;
    page <
      maxPages;
    page += 1
  ) {
    const data =
      await graphqlRequest<{
        transactions?:
          ZarinpalTransactionRow[]
          | null;
      }>(
        query,
        {
          terminal_id:
            terminalId(),

          filter:
            "PAID",

          limit:
            pageSize,

          offset:
            page *
            pageSize,
        },
      );

    const rows =
      Array.isArray(
        data.transactions,
      )
        ? data.transactions
        : [];

    for (
      const row
      of rows
    ) {
      const id =
        stringValue(
          row.id,
        );

      const status =
        statusValue(
          row.status,
        );

      const amount =
        numberValue(
          row.amount,
        );

      const description =
        stringValue(
          row.description,
        );

      if (
        id &&
        status ===
          "PAID" &&
        amount ===
          expectedAmount &&
        description ===
          expectedDescription
      ) {
        matches.push({
          id,
          status,
          amount,
          description,
        });
      }
    }

    if (
      matches.length >
      1
    ) {
      throw new Error(
        "ZARINPAL_REFUND_SESSION_AMBIGUOUS",
      );
    }

    if (
      rows.length <
      pageSize
    ) {
      exhausted =
        true;

      break;
    }
  }

  if (!exhausted) {
    throw new Error(
      "ZARINPAL_REFUND_SESSION_LOOKUP_TRUNCATED",
    );
  }

  if (
    matches.length !==
    1
  ) {
    throw new Error(
      "ZARINPAL_REFUND_SESSION_NOT_FOUND",
    );
  }

  return {
    sessionId:
      matches[0]!.id,

    gatewayAmount:
      expectedAmount,

    description:
      expectedDescription,
  };
}

export async function createZarinpalRefund(
  input: {
    sessionId: string;
    amountRial: number;
    description: string;
  },
) {
  const amount =
    gatewayAmount(
      input.amountRial,
    );

  const query =
    `
      mutation DndAddRefund(
        $session_id: ID!,
        $amount: BigInteger!,
        $description: String,
        $method: InstantPayoutActionTypeEnum,
        $reason: RefundReasonEnum
      ) {
        resource: AddRefund(
          session_id: $session_id,
          amount: $amount,
          description: $description,
          method: $method,
          reason: $reason
        ) {
          terminal_id
          id
          amount
          timeline {
            refund_amount
            refund_time
            refund_status
          }
        }
      }
    `;

  const data =
    await graphqlRequest<{
      resource?:
        ZarinpalRefundResource
        | null;
    }>(
      query,
      {
        session_id:
          input.sessionId,

        amount,

        description:
          input.description
            .slice(
              0,
              220,
            ),

        method:
          refundMethod(),

        reason:
          "CUSTOMER_REQUEST",
      },
      true,
    );

  const resource =
    data.resource;

  if (!resource) {
    throw new ZarinpalRefundOutcomeUncertainError(
      "ZARINPAL_REFUND_RESOURCE_UNCERTAIN",
      "ZarinPal refund response did not include a refund resource after the request may have been accepted.",
    );
  }

  const providerRefundId =
    stringValue(
      resource.id,
    );

  if (!providerRefundId) {
    throw new ZarinpalRefundOutcomeUncertainError(
      "ZARINPAL_REFUND_ID_UNCERTAIN",
      "ZarinPal refund response did not include a refund id after the request may have been accepted.",
    );
  }

  return normalizeProviderResult(
    providerRefundId,
    resource,
    amount,
  );
}

export async function queryZarinpalRefund(
  input: {
    providerRefundId: string;
    amountRial: number;
  },
) {
  const amount =
    gatewayAmount(
      input.amountRial,
    );

  const query =
    `
      query DndGetRefund(
        $id: ID!
      ) {
        refund: GetRefund(
          id: $id
        ) {
          id
          amount
          status
          created_at
          description
        }
      }
    `;

  const data =
    await graphqlRequest<{
      refund?:
        ZarinpalRefundResource
        | null;
    }>(
      query,
      {
        id:
          input.providerRefundId,
      },
    );

  const resource =
    data.refund;

  if (!resource) {
    throw new Error(
      "ZARINPAL_REFUND_QUERY_NOT_FOUND",
    );
  }

  const returnedId =
    stringValue(
      resource.id,
    );

  if (
    returnedId !==
    input.providerRefundId
  ) {
    throw new Error(
      "ZARINPAL_REFUND_QUERY_ID_MISMATCH",
    );
  }

  return normalizeProviderResult(
    input.providerRefundId,
    resource,
    amount,
  );
}

export function zarinpalRefundHealth() {
  const tokenConfigured =
    Boolean(
      process.env
        .ZARINPAL_ACCESS_TOKEN
        ?.trim(),
    );

  const terminalConfigured =
    Boolean(
      process.env
        .ZARINPAL_TERMINAL_ID
        ?.trim(),
    );

  const method =
    process.env
      .ZARINPAL_REFUND_METHOD
      ?.trim()
      .toUpperCase();

  const methodConfigured =
    method ===
      "CARD" ||
    method ===
      "PAYA";

  const configured =
    tokenConfigured &&
    terminalConfigured &&
    methodConfigured;

  return {
    configured,
    healthy:
      configured,

    message:
      configured
        ? "ZarinPal refund GraphQL credentials and routing are configured."
        : "ZARINPAL_ACCESS_TOKEN, ZARINPAL_TERMINAL_ID, and ZARINPAL_REFUND_METHOD are required for live refunds.",
  };
}
