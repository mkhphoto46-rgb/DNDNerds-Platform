import {
  NextResponse,
} from "next/server";

import type {
  NextRequest,
} from "next/server";

const safeMethods =
  new Set([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

function securityHeaders(
  response:
    NextResponse,
) {
  response.headers.set(
    "X-Content-Type-Options",
    "nosniff",
  );

  response.headers.set(
    "X-Frame-Options",
    "DENY",
  );

  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );

  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  response.headers.set(
    "Cross-Origin-Opener-Policy",
    "same-origin",
  );

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  return response;
}

export function proxy(
  request:
    NextRequest,
) {
  if (process.env.FREE_LAUNCH_MODE === "true" &&
    /^\/(cart|checkout|orders|seller)(\/|$)/.test(request.nextUrl.pathname)) {
    return securityHeaders(NextResponse.redirect(new URL("/store", request.url)));
  }
  const method =
    request.method
      .toUpperCase();

  if (
    request.nextUrl.pathname
      .startsWith(
        "/api/",
      ) &&
    !safeMethods.has(
      method,
    )
  ) {
    const origin =
      request.headers.get(
        "origin",
      );

    const forwardedHost =
      request.headers.get(
        "x-forwarded-host",
      );

    const host =
      forwardedHost ??
      request.headers.get(
        "host",
      ) ??
      request.nextUrl.host;

    const fetchSite =
      request.headers.get(
        "sec-fetch-site",
      );

    let allowed =
      false;

    if (
      origin &&
      host
    ) {
      try {
        allowed =
          new URL(
            origin,
          ).host ===
          host;
      }
      catch {
        allowed =
          false;
      }
    }

    if (
      fetchSite &&
      ![
        "same-origin",
        "same-site",
        "none",
      ].includes(
        fetchSite,
      )
    ) {
      allowed =
        false;
    }

    if (!allowed) {
      return securityHeaders(
        NextResponse.json(
          {
            error: {
              code:
                "CSRF_BLOCKED",

              message:
                "Cross-site state-changing request blocked.",
            },
          },
          {
            status:
              403,
          },
        ),
      );
    }
  }

  return securityHeaders(
    NextResponse.next(),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
