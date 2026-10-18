export type PublicEdgeProbe = {
  apiBaseUrl: string;
  callbackPath: string;
  publicApiExposed: false;
  webEdgePort: 3100;
  internalApiPort: 4100;
};

export function publicEdgeProbe():
  PublicEdgeProbe {
  return {
    apiBaseUrl:
      process.env
        .MARKETPLACE_API_BASE_URL ??
      "http://127.0.0.1:4100",

    callbackPath:
      "/api/v1/payments/callback/:provider/:intentId",

    publicApiExposed:
      false,

    webEdgePort:
      3100,

    internalApiPort:
      4100,
  };
}
