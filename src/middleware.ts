import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  const username = process.env.DEMO_ADMIN_USER;
  const password = process.env.DEMO_ADMIN_PASSWORD;

  if (!username || !password) {
    return new NextResponse("Demo admin access is not configured", {
      status: 503,
    });
  }

  const authorization = request.headers.get("authorization");
  const expected = `Basic ${btoa(`${username}:${password}`)}`;

  if (authorization !== expected) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Baan Sabai Demo"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/pos/:path*", "/api/admin/:path*", "/api/pos/:path*"],
};
