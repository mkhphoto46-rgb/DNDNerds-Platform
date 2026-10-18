import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const BASE32 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey() {
  const hex =
    process.env
      .MFA_ENCRYPTION_KEY;

  if (
    !hex ||
    !/^[0-9a-f]{64}$/i.test(hex)
  ) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be a 32-byte hex value.",
    );
  }

  return Buffer.from(
    hex,
    "hex",
  );
}

function base32Encode(
  buffer: Buffer,
) {
  let bits =
    "";

  for (
    const byte
    of buffer
  ) {
    bits +=
      byte
        .toString(2)
        .padStart(
          8,
          "0",
        );
  }

  let output =
    "";

  for (
    let index = 0;
    index < bits.length;
    index += 5
  ) {
    const chunk =
      bits
        .slice(
          index,
          index + 5,
        )
        .padEnd(
          5,
          "0",
        );

    output +=
      BASE32[
        Number.parseInt(
          chunk,
          2,
        )
      ];
  }

  return output;
}

function base32Decode(
  value: string,
) {
  const normalized =
    value
      .toUpperCase()
      .replace(
        /[^A-Z2-7]/g,
        "",
      );

  let bits =
    "";

  for (
    const char
    of normalized
  ) {
    const index =
      BASE32.indexOf(
        char,
      );

    if (index < 0) {
      throw new Error(
        "Invalid base32 secret.",
      );
    }

    bits +=
      index
        .toString(2)
        .padStart(
          5,
          "0",
        );
  }

  const bytes: number[] =
    [];

  for (
    let index = 0;
    index + 8 <= bits.length;
    index += 8
  ) {
    bytes.push(
      Number.parseInt(
        bits.slice(
          index,
          index + 8,
        ),
        2,
      ),
    );
  }

  return Buffer.from(
    bytes,
  );
}

export function generateTotpSecret() {
  return base32Encode(
    randomBytes(20),
  );
}

export function encryptTotpSecret(
  secret: string,
) {
  const key =
    encryptionKey();

  const iv =
    randomBytes(12);

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      key,
      iv,
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        secret,
        "utf8",
      ),

      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    "v1",
    iv.toString(
      "base64url",
    ),
    tag.toString(
      "base64url",
    ),
    ciphertext.toString(
      "base64url",
    ),
  ].join(".");
}

export function decryptTotpSecret(
  encrypted: string,
) {
  const [
    version,
    ivText,
    tagText,
    cipherText,
  ] =
    encrypted.split(".");

  if (
    version !== "v1" ||
    !ivText ||
    !tagText ||
    !cipherText
  ) {
    throw new Error(
      "Invalid encrypted TOTP secret.",
    );
  }

  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(
        ivText,
        "base64url",
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      tagText,
      "base64url",
    ),
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          cipherText,
          "base64url",
        ),
      ),

      decipher.final(),
    ]);

  return plaintext.toString(
    "utf8",
  );
}

export function totpCode(
  secret: string,
  unixSeconds =
    Math.floor(
      Date.now() / 1000,
    ),
) {
  const counter =
    Math.floor(
      unixSeconds / 30,
    );

  const counterBuffer =
    Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(
    BigInt(counter),
  );

  const digest =
    createHmac(
      "sha1",
      base32Decode(
        secret,
      ),
    )
      .update(
        counterBuffer,
      )
      .digest();

  const offset =
    digest[
      digest.length - 1
    ]! & 0x0f;

  const binary =
    (
      (
        digest[offset]! &
        0x7f
      ) << 24
    ) |
    (
      (
        digest[
          offset + 1
        ]! &
        0xff
      ) << 16
    ) |
    (
      (
        digest[
          offset + 2
        ]! &
        0xff
      ) << 8
    ) |
    (
      digest[
        offset + 3
      ]! &
      0xff
    );

  return (
    binary %
    1_000_000
  )
    .toString()
    .padStart(
      6,
      "0",
    );
}

export function verifyTotpSecret(
  secret: string,
  code: string,
) {
  if (
    !/^\d{6}$/.test(
      code,
    )
  ) {
    return false;
  }

  const now =
    Math.floor(
      Date.now() / 1000,
    );

  for (
    const offset
    of [
      -30,
      0,
      30,
    ]
  ) {
    if (
      totpCode(
        secret,
        now + offset,
      ) ===
      code
    ) {
      return true;
    }
  }

  return false;
}

export function verifyEncryptedTotp(
  encrypted: string,
  code: string,
) {
  return verifyTotpSecret(
    decryptTotpSecret(
      encrypted,
    ),
    code,
  );
}

export function buildOtpAuthUri(
  email: string,
  secret: string,
) {
  const issuer =
    "DND Nerds";

  const label =
    encodeURIComponent(
      `${issuer}:${email}`,
    );

  return (
    `otpauth://totp/${label}` +
    `?secret=${encodeURIComponent(secret)}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    "&algorithm=SHA1&digits=6&period=30"
  );
}