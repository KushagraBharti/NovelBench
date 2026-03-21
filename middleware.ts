import { NextResponse, type NextRequest } from "next/server";
import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

function isProtectedPage(pathname: string) {
  return (
    pathname === "/arena" ||
    pathname.startsWith("/arena/") ||
    pathname === "/archive" ||
    pathname.startsWith("/archive/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

function isProtectedApi(pathname: string) {
  return pathname === "/api/benchmark" || pathname.startsWith("/api/benchmark/");
}

const authMiddleware = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const pathname = request.nextUrl.pathname;
  if (!(isProtectedPage(pathname) || isProtectedApi(pathname))) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  const isAuthenticated = await convexAuth.isAuthenticated();
  if (isAuthenticated) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  if (isProtectedApi(pathname)) {
    return NextResponse.json({ error: "Sign in to use the arena." }, { status: 401 });
  }

  const redirectPath = `${pathname}${request.nextUrl.search}`;
  return nextjsMiddlewareRedirect(
    request,
    `/sign-in?redirect=${encodeURIComponent(redirectPath)}`,
  );
});

export default async function middleware(request: NextRequest, event: unknown) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const response = (await authMiddleware(request, event as never)) ?? NextResponse.next();
  response.headers.set("x-request-id", requestId);

  console.info(
    JSON.stringify({
      event: "http.request",
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      status: response.status,
      at: new Date().toISOString(),
    }),
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
