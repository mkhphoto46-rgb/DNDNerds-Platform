import "dotenv/config";

import {
  evaluateLivePaymentReadiness,
} from "./live-readiness.js";

function argumentValue(
  name: string,
) {
  const index =
    process.argv.indexOf(
      name,
    );

  if (
    index < 0
  ) {
    return undefined;
  }

  return process.argv[
    index + 1
  ];
}

const provider =
  argumentValue(
    "--provider",
  );

const result =
  evaluateLivePaymentReadiness({
    provider,
  });

console.log(
  JSON.stringify(
    result,
    null,
    2,
  ),
);

process.exit(
  result.ready
    ? 0
    : 2,
);
