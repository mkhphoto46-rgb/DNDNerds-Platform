import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  createReadStream,
} from "node:fs";

import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  extname,
  resolve,
  sep,
} from "node:path";

export const REFUND_EVIDENCE_MAX_FILE_BYTES =
  8 * 1024 * 1024;

export const REFUND_EVIDENCE_MAX_FILES_PER_CASE =
  5;

const STORAGE_KEY_PATTERN =
  /^refund-cases\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

function storageRoot() {
  const configured =
    process.env
      .REFUND_EVIDENCE_ROOT
      ?.trim();

  const root =
    configured ||
    resolve(
      process.cwd(),
      "../../private/refund-evidence",
    );

  return resolve(
    root,
  );
}

function extensionForMime(
  mimeType:
    string,
) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";

    case "image/png":
      return ".png";

    case "image/webp":
      return ".webp";

    default:
      throw new Error(
        "UNSUPPORTED_EVIDENCE_IMAGE_TYPE",
      );
  }
}

function pathForStorageKey(
  storageKey:
    string,
) {
  if (
    !STORAGE_KEY_PATTERN.test(
      storageKey,
    )
  ) {
    throw new Error(
      "INVALID_EVIDENCE_STORAGE_KEY",
    );
  }

  const root =
    storageRoot();

  const target =
    resolve(
      root,
      ...storageKey.split("/"),
    );

  const prefix =
    root.endsWith(sep)
      ? root
      : root + sep;

  if (
    !target.startsWith(
      prefix,
    )
  ) {
    throw new Error(
      "EVIDENCE_STORAGE_PATH_ESCAPE",
    );
  }

  return target;
}

export function detectEvidenceImageMimeType(
  bytes:
    Buffer,
) {
  if (
    bytes.length >=
      3 &&
    bytes[0] ===
      0xff &&
    bytes[1] ===
      0xd8 &&
    bytes[2] ===
      0xff
  ) {
    return "image/jpeg" as const;
  }

  if (
    bytes.length >=
      8 &&
    bytes.subarray(
      0,
      8,
    ).equals(
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]),
    )
  ) {
    return "image/png" as const;
  }

  if (
    bytes.length >=
      12 &&
    bytes.subarray(
      0,
      4,
    ).toString(
      "ascii",
    ) ===
      "RIFF" &&
    bytes.subarray(
      8,
      12,
    ).toString(
      "ascii",
    ) ===
      "WEBP"
  ) {
    return "image/webp" as const;
  }

  return null;
}

export function normalizeEvidenceOriginalName(
  rawName:
    string,
) {
  const withoutControls =
    rawName
      .replace(
        /[\u0000-\u001f\u007f]/g,
        "",
      )
      .replace(
        /[\\/]/g,
        "_",
      )
      .trim();

  const normalized =
    withoutControls ||
    "evidence-image";

  return normalized.slice(
    0,
    220,
  );
}

export async function storePrivateEvidence(
  input: {
    caseId: string;
    bytes: Buffer;
    mimeType: string;
  },
) {
  if (
    input.bytes.length <=
      0 ||
    input.bytes.length >
      REFUND_EVIDENCE_MAX_FILE_BYTES
  ) {
    throw new Error(
      "EVIDENCE_FILE_SIZE_INVALID",
    );
  }

  const detected =
    detectEvidenceImageMimeType(
      input.bytes,
    );

  if (
    !detected ||
    detected !==
      input.mimeType
  ) {
    throw new Error(
      "EVIDENCE_FILE_SIGNATURE_MISMATCH",
    );
  }

  const extension =
    extensionForMime(
      detected,
    );

  const storageKey =
    [
      "refund-cases",
      input.caseId,
      `${randomUUID()}${extension}`,
    ].join("/");

  const target =
    pathForStorageKey(
      storageKey,
    );

  await mkdir(
    resolve(
      target,
      "..",
    ),
    {
      recursive:
        true,
    },
  );

  await writeFile(
    target,
    input.bytes,
    {
      flag:
        "wx",
    },
  );

  return {
    storageKey,

    mimeType:
      detected,

    sizeBytes:
      input.bytes.length,

    sha256:
      createHash(
        "sha256",
      )
        .update(
          input.bytes,
        )
        .digest(
          "hex",
        ),
  };
}

export async function removePrivateEvidence(
  storageKey:
    string,
) {
  const target =
    pathForStorageKey(
      storageKey,
    );

  await rm(
    target,
    {
      force:
        true,
    },
  );
}

export function openPrivateEvidenceStream(
  storageKey:
    string,
) {
  const target =
    pathForStorageKey(
      storageKey,
    );

  return createReadStream(
    target,
  );
}

export async function readPrivateEvidenceForTest(
  storageKey:
    string,
) {
  return readFile(
    pathForStorageKey(
      storageKey,
    ),
  );
}

export function extensionForEvidenceMime(
  mimeType:
    string,
) {
  return extname(
    `file${extensionForMime(mimeType)}`,
  );
}
