import {
  publicEdgeProbe,
} from "./public-edge-probe.js";

function assert(
  condition: boolean,
  message: string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main() {
  const probe =
    publicEdgeProbe();

  assert(
    probe.apiBaseUrl ===
      "http://127.0.0.1:4100" ||
    probe.apiBaseUrl.startsWith(
      "http://127.0.0.1:",
    ),
    "Internal API is not loopback-bound from the web edge perspective.",
  );

  assert(
    probe.callbackPath ===
      "/api/v1/payments/callback/:provider/:intentId",
    "Public callback path contract is invalid.",
  );

  assert(
    probe.publicApiExposed ===
      false,
    "The public edge must not expose the raw API service.",
  );

  assert(
    probe.webEdgePort ===
      3100 &&
    probe.internalApiPort ===
      4100,
    "Expected edge/internal port contract changed.",
  );

  console.log(
    JSON.stringify(
      {
        loopbackApi:
          true,

        callbackContract:
          true,

        webOnlyPublicEdge:
          true,

        webPort:
          probe.webEdgePort,

        internalApiPort:
          probe.internalApiPort,
      },
      null,
      2,
    ),
  );
}

main().catch(
  error => {
    console.error(
      error,
    );

    process.exit(
      1,
    );
  },
);
