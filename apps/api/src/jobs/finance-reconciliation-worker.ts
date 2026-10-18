import {
  sqlClient,
} from "../db/client.js";

import {
  reconcilePendingRefunds,
} from "../refunds/reconciliation.js";

import {
  reconcileProcessingPayouts,
} from "../payouts/reconciliation.js";

const FINANCE_WORKER_LOCK =
  2_026_100_802;

const DEFAULT_INTERVAL_MS =
  60_000;

const DEFAULT_LIMIT =
  50;

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw =
    process.env[
      name
    ];

  if (!raw) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      raw,
      10,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      minimum ||
    parsed >
      maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    resolve => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

async function main() {
  const checkOnly =
    process.argv.includes(
      "--check",
    );

  const runOnce =
    process.argv.includes(
      "--once",
    );

  const intervalMs =
    boundedInteger(
      "FINANCE_RECONCILE_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      10_000,
      3_600_000,
    );

  const limit =
    boundedInteger(
      "FINANCE_RECONCILE_LIMIT",
      DEFAULT_LIMIT,
      1,
      250,
    );

  const reserved =
    await sqlClient.reserve();

  let acquired =
    false;

  let running =
    false;

  let shuttingDown =
    false;

  let timer:
    NodeJS.Timeout | null =
      null;

  async function releaseLock() {
    if (!acquired) {
      return;
    }

    try {
      await reserved`
        SELECT pg_advisory_unlock(
          ${FINANCE_WORKER_LOCK}
        )
      `;
    }
    finally {
      acquired =
        false;
    }
  }

  async function shutdown(
    signal: string,
    exitCode = 0,
  ) {
    if (shuttingDown) {
      return;
    }

    shuttingDown =
      true;

    if (timer) {
      clearInterval(
        timer,
      );

      timer =
        null;
    }

    const deadline =
      Date.now() +
      30_000;

    while (
      running &&
      Date.now() <
        deadline
    ) {
      await sleep(
        100,
      );
    }

    try {
      await releaseLock();
    }
    catch (error) {
      console.error(
        JSON.stringify({
          job:
            "finance-reconciliation-worker",

          event:
            "unlock-failed",

          signal,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
        }),
      );

      exitCode =
        1;
    }
    finally {
      reserved.release();
    }

    console.log(
      JSON.stringify({
        job:
          "finance-reconciliation-worker",

        event:
          "stopped",

        signal,

        exitCode,
      }),
    );

    process.exit(
      exitCode,
    );
  }

  async function runCycle() {
    if (
      running ||
      shuttingDown
    ) {
      return;
    }

    running =
      true;

    const startedAt =
      new Date();

    let refundResult:
      unknown =
        null;

    let payoutResult:
      unknown =
        null;

    let refundError:
      string | null =
        null;

    let payoutError:
      string | null =
        null;

    try {
      try {
        refundResult =
          await reconcilePendingRefunds(
            limit,
          );
      }
      catch (error) {
        refundError =
          error instanceof Error
            ? error.message
            : String(
                error,
              );
      }

      try {
        payoutResult =
          await reconcileProcessingPayouts(
            limit,
          );
      }
      catch (error) {
        payoutError =
          error instanceof Error
            ? error.message
            : String(
                error,
              );
      }

      console.log(
        JSON.stringify({
          job:
            "finance-reconciliation-worker",

          event:
            "cycle",

          startedAt:
            startedAt.toISOString(),

          finishedAt:
            new Date()
              .toISOString(),

          intervalMs,

          limit,

          refundResult,

          payoutResult,

          refundError,

          payoutError,
        }),
      );
    }
    finally {
      running =
        false;
    }
  }

  try {
    const rows =
      await reserved`
        SELECT pg_try_advisory_lock(
          ${FINANCE_WORKER_LOCK}
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
            "finance-reconciliation-worker",

          event:
            "singleton-lock-busy",

          skipped:
            true,

          reason:
            "another finance reconciliation worker already owns the PostgreSQL advisory lock",
        }),
      );

      reserved.release();
      process.exit(
        0,
      );
    }

    console.log(
      JSON.stringify({
        job:
          "finance-reconciliation-worker",

        event:
          "singleton-lock-acquired",

        intervalMs,

        limit,

        checkOnly,

        runOnce,
      }),
    );

    if (checkOnly) {
      await releaseLock();
      reserved.release();

      console.log(
        JSON.stringify({
          job:
            "finance-reconciliation-worker",

          event:
            "check-pass",

          database:
            "reachable",

          singletonLock:
            "PASS",

          reconciliationExecuted:
            false,
        }),
      );

      // Check mode is a one-shot health probe. The shared postgres
      // client owns a pool handle, so exit explicitly after releasing
      // the advisory lock and reserved connection.
      process.exit(
        0,
      );
    }

    process.once(
      "SIGINT",
      () => {
        void shutdown(
          "SIGINT",
        );
      },
    );

    process.once(
      "SIGTERM",
      () => {
        void shutdown(
          "SIGTERM",
        );
      },
    );

    process.once(
      "uncaughtException",
      error => {
        console.error(
          error,
        );

        void shutdown(
          "uncaughtException",
          1,
        );
      },
    );

    process.once(
      "unhandledRejection",
      reason => {
        console.error(
          reason,
        );

        void shutdown(
          "unhandledRejection",
          1,
        );
      },
    );

    await runCycle();

    if (runOnce) {
      await shutdown(
        "ONCE_COMPLETE",
      );

      return;
    }

    timer =
      setInterval(
        () => {
          void runCycle();
        },
        intervalMs,
      );

    console.log(
      JSON.stringify({
        job:
          "finance-reconciliation-worker",

        event:
          "ready",

        intervalMs,

        limit,
      }),
    );
  }
  catch (error) {
    try {
      await releaseLock();
    }
    finally {
      reserved.release();
    }

    throw error;
  }
}

main()
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
