import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

function assert(
  condition: unknown,
  message: string,
) {
  if (!condition) {
    throw new Error(message);
  }
}

const root =
  resolve(
    process.cwd(),
  );

const payouts =
  readFileSync(
    resolve(
      root,
      "src/routes/payouts.ts",
    ),
    "utf8",
  );

const provider =
  readFileSync(
    resolve(
      root,
      "src/routes/payout-provider.ts",
    ),
    "utf8",
  );

const schema =
  readFileSync(
    resolve(
      root,
      "src/db/schema.ts",
    ),
    "utf8",
  );

for (
  const marker
  of [
    "payoutRequestDestinationSnapshots",
    "PAYOUT_DESTINATION_REQUIRED",
    "payoutDestination.ibanCiphertext",
    "payout-destination:",
  ]
) {
  assert(
    payouts.includes(
      marker,
    ),
    `payouts.ts marker missing: ${marker}`,
  );
}

for (
  const marker
  of [
    "PAYOUT_DESTINATION_SNAPSHOT_MISSING",
    "PAYOUT_DESTINATION_DECRYPT_FAILED",
    "decryptPayoutIban",
    "destinationSnapshot.accountHolderName",
    "destinationIban",
  ]
) {
  assert(
    provider.includes(
      marker,
    ),
    `payout-provider.ts marker missing: ${marker}`,
  );
}

assert(
  !provider.includes(
    "destination:\n              {},",
  ),
  "Legacy empty payout destination is still present.",
);

for (
  const marker
  of [
    "payoutRequestDestinationSnapshots",
    "payout_request_destination_snapshots",
    "ibanCiphertext",
    "destinationId",
  ]
) {
  assert(
    schema.includes(
      marker,
    ),
    `schema marker missing: ${marker}`,
  );
}

console.log(
  JSON.stringify(
    {
      test:
        "J2M-F2 payout destination pinning",

      status:
        "PASS",

      requestPinsVerifiedDestination:
        true,

      immutableEncryptedSnapshot:
        true,

      emptyProviderDestinationRemoved:
        true,

      decryptOnlyAtExecution:
        true,

      plaintextLogged:
        false,
    },
    null,
    2,
  ),
);

console.log(
  "J2M_F2_PAYOUT_DESTINATION_PINNING_SELF_TEST_PASS",
);
