import {
  sqlClient,
} from "../db/client.js";

import {
  expireDueOrders,
} from "../payments/payment-service.js";

const EXPIRY_JOB_LOCK =
  2_026_100_701;

async function main() {
  const reserved =
    await sqlClient.reserve();

  let acquired =
    false;

  try {
    const rows =
      await reserved`
        SELECT pg_try_advisory_lock(
          ${EXPIRY_JOB_LOCK}
        ) AS acquired
      `;

    acquired =
      rows[0]
        ?.acquired ===
      true;

    if (!acquired) {
      console.log(
        JSON.stringify({
          job:
            "expire-payments",

          skipped:
            true,

          reason:
            "another expiry worker holds the singleton lock",
        }),
      );

      return;
    }

    const result =
      await expireDueOrders();

    console.log(
      JSON.stringify({
        job:
          "expire-payments",

        skipped:
          false,

        ...result,
      }),
    );
  }
  finally {
    if (acquired) {
      await reserved`
        SELECT pg_advisory_unlock(
          ${EXPIRY_JOB_LOCK}
        )
      `;
    }

    reserved.release();
  }
}

main()
  .then(
    () => {
      process.exit(0);
    },
  )
  .catch(
    error => {
      console.error(
        error,
      );

      process.exit(1);
    },
  );
