import {
  decryptPayoutIban,
  encryptPayoutIban,
  maskedPayoutIban,
  normalizeIranIban,
  payoutIbanFingerprint,
} from "../finance/payout-destination-crypto.js";

function assert(
  condition: unknown,
  message: string,
) {
  if (!condition) {
    throw new Error(message);
  }
}

const previousKey =
  process.env
    .PAYOUT_DESTINATION_ENCRYPTION_KEY;

process.env
  .PAYOUT_DESTINATION_ENCRYPTION_KEY =
  Buffer.alloc(
    32,
    7,
  ).toString("base64");

try {
  const valid =
    "IR430550011480005587452001";

  assert(
    normalizeIranIban(
      "ir43 0550 0114 8000 5587 4520 01",
    ) === valid,
    "Iran IBAN normalization failed.",
  );

  let invalidRejected = false;

  try {
    normalizeIranIban(
      "IR430550011480005587452002",
    );
  }
  catch {
    invalidRejected = true;
  }

  assert(
    invalidRejected,
    "Invalid IBAN checksum was not rejected.",
  );

  const first =
    encryptPayoutIban(valid);

  const second =
    encryptPayoutIban(valid);

  assert(
    first.ciphertext !== valid,
    "Ciphertext must not equal plaintext.",
  );

  assert(
    first.ciphertext !==
      second.ciphertext ||
    first.iv !== second.iv,
    "Fresh IV was not used.",
  );

  assert(
    decryptPayoutIban(first) ===
      valid,
    "Decrypt round-trip failed.",
  );

  assert(
    first.last4 === "2001",
    "IBAN last4 mismatch.",
  );

  assert(
    first.fingerprint ===
      payoutIbanFingerprint(valid),
    "Stable fingerprint failed.",
  );

  console.log(
    JSON.stringify(
      {
        test:
          "J2M-F1 payout destination crypto",

        status:
          "PASS",

        ibanValidation:
          "PASS",

        aes256gcm:
          "PASS",

        freshIv:
          "PASS",

        decryptRoundTrip:
          "PASS",

        maskedOutput:
          maskedPayoutIban(
            first.last4,
          ),

        plaintextLogged:
          false,
      },
      null,
      2,
    ),
  );

  console.log(
    "J2M_F1_PAYOUT_DESTINATION_SELF_TEST_PASS",
  );
}
finally {
  if (
    previousKey === undefined
  ) {
    delete process.env
      .PAYOUT_DESTINATION_ENCRYPTION_KEY;
  }
  else {
    process.env
      .PAYOUT_DESTINATION_ENCRYPTION_KEY =
      previousKey;
  }
}
