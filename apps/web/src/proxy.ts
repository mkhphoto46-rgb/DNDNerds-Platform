import {visitorAddress} from './lib/visitor-address';
import {storeHostRoute} from './lib/store-address';
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
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
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

function storeError(status:number,title:string,message:string){
  return securityHeaders(new NextResponse(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | DND Nerds</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#061427;color:#f7f5ef;font-family:Tahoma,sans-serif;line-height:2}main{box-sizing:border-box;width:min(90%,640px);padding:32px;border:1px solid #36c9da;border-radius:24px;background:#052333}h1{color:#efc477;font-size:clamp(24px,5vw,36px)}a{display:inline-block;margin-top:16px;padding:10px 20px;border-radius:12px;background:#efc477;color:#061427;text-decoration:none}a:focus-visible{outline:3px solid #36c9da;outline-offset:4px}</style></head><body><main><span dir="ltr">DND Nerds</span><h1>${title}</h1><p>${message}</p><a href="https://dndnerds.ir/store">بازگشت به بازارچه</a></main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(status===503?{'Retry-After':'30'}:{})}}));
}

export async function proxy(
  request:
    NextRequest,
) {
  const storeRoute=storeHostRoute(request.headers.get('host')??request.nextUrl.host,request.nextUrl.pathname);
  if(storeRoute){
    const destination=request.nextUrl.clone();destination.pathname=storeRoute.pathname;
    if(storeRoute.kind==='rewrite'){
      try{
        const address=visitorAddress(request.headers);
        const result=await fetch(`${process.env.MARKETPLACE_API_BASE_URL??'http://127.0.0.1:4100'}/api/v1/stores/${encodeURIComponent(storeRoute.pathname.split('/').at(-1)!)}`,{cache:'no-store',signal:AbortSignal.timeout(5000),headers:address?{'X-Forwarded-For':address}:{}});
        if(result.status===404)return storeError(404,'این فروشگاه پیدا نشد','فروشگاه مورد نظر وجود ندارد یا هنوز فعال نشده است.');
        if(!result.ok)throw new Error('Store lookup unavailable');
        return securityHeaders(NextResponse.rewrite(destination));
      }catch{return storeError(503,'فروشگاه موقتاً در دسترس نیست','لطفاً کمی بعد دوباره تلاش کنید.');}
    }
    destination.protocol='https:';destination.host='dndnerds.ir';destination.port='';
    return securityHeaders(NextResponse.redirect(destination));
  }
  const sellerPreparation=/^\/seller\/marketplace\/?$/.test(request.nextUrl.pathname);
  if (process.env.FREE_LAUNCH_MODE === "true" && !sellerPreparation &&
    /^\/(cart|checkout|orders|seller)(\/|$)/.test(request.nextUrl.pathname)) {
    return securityHeaders(NextResponse.redirect(new URL("/store", request.url)));
  }
  if (/^\/admin(?:\/|$)/.test(request.nextUrl.pathname)) {
    const response = securityHeaders(request.cookies.has("dnd_session")
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login?next=%2Fadmin", request.url)));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
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
