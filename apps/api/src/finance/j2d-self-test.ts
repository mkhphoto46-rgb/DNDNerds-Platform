import {
  applyRefundClawback,
  releaseDeliveredFunds,
  releasePayoutReservation,
} from "./seller-balance-policy.js";

import {
  hashOrderRequest,
} from "../orders/order-idempotency.js";

function assert(
  condition: boolean,
  message: string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main() {
  const base = {
    address: {
      fullName:
        "Test User",
      phone:
        "09120000000",
      province:
        "Tehran",
      city:
        "Tehran",
      addressLine1:
        "Test address",
      addressLine2:
        "",
      postalCode:
        "1234567890",
    },

    items: [
      {
        productId:
          "00000000-0000-4000-8000-000000000002",
        quantity:
          1,
      },
      {
        productId:
          "00000000-0000-4000-8000-000000000001",
        quantity:
          2,
      },
    ],
  };

  const reordered = {
    ...base,
    items:
      [...base.items]
        .reverse(),
  };

  const changedQuantity = {
    ...base,
    items: [
      {
        ...base.items[0]!,
        quantity:
          3,
      },
      base.items[1]!,
    ],
  };

  const hashA =
    hashOrderRequest(
      base,
    );

  const hashB =
    hashOrderRequest(
      reordered,
    );

  const hashChanged =
    hashOrderRequest(
      changedQuantity,
    );

  assert(
    hashA ===
      hashB,
    "Equivalent order payloads did not produce the same hash.",
  );

  assert(
    hashA !==
      hashChanged,
    "Changed order payload did not change the request hash.",
  );

  const clawbackA =
    applyRefundClawback(
      {
        pendingRial:
          100,
        availableRial:
          50,
        negativeRial:
          0,
        paidOutRial:
          0,
      },
      120,
    );

  assert(
    clawbackA.pendingRial ===
      0 &&
    clawbackA.availableRial ===
      30 &&
    clawbackA.negativeRial ===
      0,
    "Refund clawback pending/available waterfall failed.",
  );

  const clawbackB =
    applyRefundClawback(
      {
        pendingRial:
          0,
        availableRial:
          20,
        negativeRial:
          0,
        paidOutRial:
          500,
      },
      50,
    );

  assert(
    clawbackB.pendingRial ===
      0 &&
    clawbackB.availableRial ===
      0 &&
    clawbackB.negativeRial ===
      30 &&
    clawbackB.paidOutRial ===
      500,
    "Post-payout negative balance clawback failed.",
  );

  const delivery =
    releaseDeliveredFunds(
      {
        pendingRial:
          100,
        availableRial:
          10,
        negativeRial:
          40,
        paidOutRial:
          500,
      },
      100,
    );

  assert(
    delivery.pendingRial ===
      0 &&
    delivery.availableRial ===
      70 &&
    delivery.negativeRial ===
      0,
    "Delivered funds did not offset negative balance first.",
  );

  const payoutRelease =
    releasePayoutReservation(
      {
        pendingRial:
          0,
        availableRial:
          10,
        negativeRial:
          30,
        paidOutRial:
          500,
      },
      50,
    );

  assert(
    payoutRelease.availableRial ===
      30 &&
    payoutRelease.negativeRial ===
      0,
    "Rejected payout reservation did not offset negative balance first.",
  );

  console.log(
    JSON.stringify(
      {
        orderHashStable:
          true,

        changedPayloadHash:
          true,

        refundWaterfall:
          true,

        postPayoutNegativeBalance:
          true,

        deliveryOffsetsClawback:
          true,

        rejectedPayoutOffsetsClawback:
          true,
      },
      null,
      2,
    ),
  );
}

main().catch(
  error => {
    console.error(
      error,
    );

    process.exit(
      1,
    );
  },
);
