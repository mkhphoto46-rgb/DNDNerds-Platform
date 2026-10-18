const API_BASE_URL =
  process.env.MARKETPLACE_API_BASE_URL ??
  "http://127.0.0.1:4100";

export async function POST(
  request: Request,
) {
  let body: unknown;

  try {
    body =
      await request.json();
  }
  catch {
    return Response.json(
      {
        error: {
          code:
            "INVALID_JSON",

          message:
            "Invalid JSON body",
        },
      },
      {
        status: 400,
      },
    );
  }

  try {
    const response =
      await fetch(
        `${API_BASE_URL}/api/v1/marketplace/checkout/preview`,
        {
          method: "POST",

          cache: "no-store",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },

          body:
            JSON.stringify(
              body,
            ),
        },
      );

    const text =
      await response.text();

    return new Response(
      text,
      {
        status:
          response.status,

        headers: {
          "Content-Type":
            response.headers.get(
              "content-type",
            ) ??
            "application/json; charset=utf-8",
        },
      },
    );
  }
  catch {
    return Response.json(
      {
        error: {
          code:
            "MARKETPLACE_API_UNAVAILABLE",

          message:
            "Marketplace API is unavailable",
        },
      },
      {
        status: 503,
      },
    );
  }
}