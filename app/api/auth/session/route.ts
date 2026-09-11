import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authCookieNames, secureCookie } from "@/services/cognito-auth.server";
import { authenticateDashboardUser, DashboardApiUnauthorizedError, DashboardAuthenticationError, verifyDashboardAccess } from "@/services/dashboard-api.server";

function isTokenPayload(value: unknown): value is { idToken: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const token = Reflect.get(value, "idToken");
  return typeof token === "string" && token.length >= 100 && token.length <= 16_384;
}

function isCredentialsPayload(value: unknown): value is { email: string; password: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const email = Reflect.get(value, "email");
  const password = Reflect.get(value, "password");
  return typeof email === "string" && email.trim().length >= 3 && email.length <= 320
    && typeof password === "string" && password.length >= 1 && password.length <= 1024;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ code: "invalid_request", message: "A JSON request is required" }, { status: 415 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ code: "invalid_request", message: "Authentication could not be completed" }, { status: 400 });
  }
  if (!isTokenPayload(payload) && !isCredentialsPayload(payload)) {
    return NextResponse.json({ code: "invalid_request", message: "Authentication could not be completed" }, { status: 400 });
  }
  try {
    const authentication = isCredentialsPayload(payload)
      ? await authenticateDashboardUser(payload.email.trim(), payload.password)
      : { idToken: payload.idToken, expiresIn: 3600 };
    await verifyDashboardAccess(authentication.idToken);
    const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(authCookieNames.access, authentication.idToken, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: authentication.expiresIn,
    });
    return response;
  } catch (error: unknown) {
    const status = error instanceof DashboardApiUnauthorizedError || error instanceof DashboardAuthenticationError ? error.status : 503;
    return NextResponse.json(
      {
        code: status === 403 ? "access_denied" : status === 429 ? "too_many_attempts" : "authentication_failed",
        message: status === 403 ? "Dashboard access is denied" : status === 429 ? "Too many authentication attempts" : "Authentication could not be completed",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
