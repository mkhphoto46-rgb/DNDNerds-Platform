import {
  processFullRefund,
} from "../payments/payment-service.js";

async function main() {
  const [
    orderId,
    idempotencyKey,
    ...reasonParts
  ] =
    process.argv.slice(2);

  if (
    !orderId ||
    !idempotencyKey
  ) {
    throw new Error(
      "Usage: node dist/jobs/refund-order.js <orderId> <idempotencyKey> [reason]",
    );
  }

  const reason =
    reasonParts.join(" ") ||
    "Administrative full refund";

  const result =
    await processFullRefund(
      orderId,
      idempotencyKey,
      reason,
    );

  console.log(
    JSON.stringify({
      job:
        "refund-order",

      refundId:
        result.refund?.id ??
        null,

      status:
        result.refund?.status ??
        null,

      idempotent:
        result.idempotent,
    }),
  );
}

main()
  .then(
    () => {
      process.exit(0);
    },
  )
  .catch(
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );