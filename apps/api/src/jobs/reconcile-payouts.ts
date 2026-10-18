import {
  reconcileProcessingPayouts,
} from "../payouts/reconciliation.js";

async function main() {
  const rawLimit =
    process.argv[2];

  const limit =
    rawLimit
      ? Number.parseInt(
          rawLimit,
          10,
        )
      : 50;

  const result =
    await reconcileProcessingPayouts(
      Number.isFinite(
        limit,
      )
        ? limit
        : 50,
    );

  console.log(
    JSON.stringify(
      {
        job:
          "reconcile-payouts",

        ...result,
      },
      null,
      2,
    ),
  );
}

main()
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
