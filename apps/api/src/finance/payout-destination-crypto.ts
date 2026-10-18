import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const IRAN_IBAN_PATTERN =
  /^IR\d{24}$/;

function encryptionKey() {
  const raw =
    process.env
      .PAYOUT_DESTINATION_ENCRYPTION_KEY
      ?.trim();

  if (!raw) {
    throw new Error(
      "PAYOUT_DESTINATION_ENCRYPTION_KEY is required.",
    );
  }

  const key =
    Buffer.from(
      raw,
      "base64",
    );

  if (key.length !== 32) {
    throw new Error(
      "PAYOUT_DESTINATION_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return key;
}

function mod97(
  value: string,
) {
  let remainder = 0;

  for (const ch of value) {
    const digit =
      ch.charCodeAt(0) - 48;

    remainder =
      (remainder * 10 + digit) %
      97;
  }

  return remainder;
}

export function normalizeIranIban(
  raw: string,
) {
  const iban =
    raw
      .replace(/\s+/g, "")
      .toUpperCase();

  if (!IRAN_IBAN_PATTERN.test(iban)) {
    throw new Error(
      "Iranian IBAN must be IR followed by exactly 24 digits.",
    );
  }

  const rearranged =
    iban.slice(4) +
    "1827" +
    iban.slice(2, 4);

  if (mod97(rearranged) !== 1) {
    throw new Error(
      "Iranian IBAN checksum is invalid.",
    );
  }

  return iban;
}

export function payoutIbanFingerprint(
  rawIban: string,
) {
  const iban =
    normalizeIranIban(rawIban);

  return createHash("sha256")
    .update(
      iban,
      "utf8",
    )
    .digest("hex");
}

export type EncryptedPayoutIban = {
  ciphertext: string;
  iv: string;
  authTag: string;
  last4: string;
  fingerprint: string;
};

export function encryptPayoutIban(
  rawIban: string,
): EncryptedPayoutIban {
  const iban =
    normalizeIranIban(rawIban);

  const iv =
    randomBytes(12);

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      encryptionKey(),
      iv,
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        iban,
        "utf8",
      ),
      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return {
    ciphertext:
      ciphertext.toString("base64"),

    iv:
      iv.toString("base64"),

    authTag:
      authTag.toString("base64"),

    last4:
      iban.slice(-4),

    fingerprint:
      payoutIbanFingerprint(iban),
  };
}

export function decryptPayoutIban(
  encrypted: {
    ciphertext: string;
    iv: string;
    authTag: string;
  },
) {
  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(
        encrypted.iv,
        "base64",
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      encrypted.authTag,
      "base64",
    ),
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          encrypted.ciphertext,
          "base64",
        ),
      ),
      decipher.final(),
    ]).toString("utf8");

  return normalizeIranIban(
    plaintext,
  );
}

export function maskedPayoutIban(
  last4: string,
) {
  const safe =
    /^\d{4}$/.test(last4)
      ? last4
      : "????";

  return (
    "IR********************" +
    safe
  );
}
