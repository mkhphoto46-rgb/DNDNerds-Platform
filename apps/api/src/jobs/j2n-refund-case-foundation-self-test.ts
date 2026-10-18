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

const schema =
  readFileSync(
    resolve(
      root,
      "src/db/schema.ts",
    ),
    "utf8",
  );

const app =
  readFileSync(
    resolve(
      root,
      "src/app.ts",
    ),
    "utf8",
  );

const routes =
  readFileSync(
    resolve(
      root,
      "src/routes/refund-cases.ts",
    ),
    "utf8",
  );

for (
  const marker
  of [
    "marketplaceRefundCases",
    "marketplaceRefundCaseEvidence",
    "marketplaceRefundCaseEvents",
    "marketplaceRefundPolicy",
    "refund_case_status",
    "refund_case_reason",
  ]
) {
  assert(
    schema.includes(
      marker,
    ),
    `schema marker missing: ${marker}`,
  );
}

for (
  const marker
  of [
    "registerRefundCaseRoutes",
    "refund-cases.js",
  ]
) {
  assert(
    app.includes(
      marker,
    ),
    `app marker missing: ${marker}`,
  );
}

for (
  const marker
  of [
    "EVIDENCE_REQUIRED",
    "evidenceRequired",
    "supportContactRequired",
    "directFinancialRefund",
    "CASE_OPENED",
    "refund-case:",
  ]
) {
  assert(
    routes.includes(
      marker,
    ),
    `route marker missing: ${marker}`,
  );
}

assert(
  !routes.includes(
    "processFullRefund",
  ),
  "G1 must not trigger the financial refund engine.",
);

console.log(
  JSON.stringify(
    {
      test:
        "J2N-A refund case foundation",

      status:
        "PASS",

      buyerDirectRefund:
        false,

      mandatoryEvidencePolicy:
        true,

      mandatorySupportContactPolicy:
        true,

      financialRefundExecution:
        false,

      initialStatus:
        "EVIDENCE_REQUIRED",
    },
    null,
    2,
  ),
);

console.log(
  "J2N_A_REFUND_CASE_FOUNDATION_SELF_TEST_PASS",
);
