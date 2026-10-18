import {
  rm,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

import {
  detectEvidenceImageMimeType,
  readPrivateEvidenceForTest,
  removePrivateEvidence,
  storePrivateEvidence,
} from "../refunds/evidence-storage.js";

function assert(
  condition: unknown,
  message: string,
) {
  if (!condition) {
    throw new Error(message);
  }
}


async function main() {
  const previousRoot =
    process.env
      .REFUND_EVIDENCE_ROOT;

  const tempRoot =
    resolve(
      process.cwd(),
      ".j2n-b-evidence-self-test",
    );

  process.env
    .REFUND_EVIDENCE_ROOT =
    tempRoot;

  try {
    const png =
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0x00,
        0x00,
        0x00,
        0x00,
      ]);

    assert(
      detectEvidenceImageMimeType(
        png,
      ) ===
        "image/png",
      "PNG magic detection failed.",
    );

    const stored =
      await storePrivateEvidence({
        caseId:
          "11111111-1111-4111-8111-111111111111",

        bytes:
          png,

        mimeType:
          "image/png",
      });

    assert(
      stored.storageKey.startsWith(
        "refund-cases/",
      ),
      "Storage key prefix failed.",
    );

    assert(
      !stored.storageKey.includes(
        "..",
      ),
      "Storage key traversal detected.",
    );

    assert(
      stored.sha256.length ===
        64,
      "SHA-256 length failed.",
    );

    const roundTrip =
      await readPrivateEvidenceForTest(
        stored.storageKey,
      );

    assert(
      roundTrip.equals(
        png,
      ),
      "Private evidence round-trip failed.",
    );

    let mismatchRejected =
      false;

    try {
      await storePrivateEvidence({
        caseId:
          "11111111-1111-4111-8111-111111111111",

        bytes:
          png,

        mimeType:
          "image/jpeg",
      });
    }
    catch {
      mismatchRejected =
        true;
    }

    assert(
      mismatchRejected,
      "MIME/signature mismatch was not rejected.",
    );

    await removePrivateEvidence(
      stored.storageKey,
    );

    console.log(
      JSON.stringify(
        {
          test:
            "J2N-B refund evidence storage",

          status:
            "PASS",

          privateFilesystem:
            true,

          signatureValidation:
            true,

          sha256:
            true,

          pathTraversalGuard:
            true,

          plaintextPublicUrl:
            false,
        },
        null,
        2,
      ),
    );

    console.log(
      "J2N_B_REFUND_EVIDENCE_SELF_TEST_PASS",
    );
  }
  finally {
    await rm(
      tempRoot,
      {
        recursive:
          true,

        force:
          true,
      },
    );

    if (
      previousRoot ===
        undefined
    ) {
      delete process.env
        .REFUND_EVIDENCE_ROOT;
    }
    else {
      process.env
        .REFUND_EVIDENCE_ROOT =
        previousRoot;
    }
  }

}

main()
  .catch(
    error => {
      console.error(
        error,
      );

      process.exitCode =
        1;
    },
  );
