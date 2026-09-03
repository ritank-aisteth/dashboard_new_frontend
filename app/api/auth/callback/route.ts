import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  applicationBaseUrl,
  authCookieNames,
  cognitoCallbackUrl,
  cognitoHostedUiConfiguration,
  secureCookie,
} from "@/services/cognito-auth.server";
import { DashboardApiUnauthorizedError, verifyDashboardAccess } from "@/services/dashboard-api.server";

interface CognitoTokens {
  id_token: string;
  expires_in?: number;
}

function isCognitoTokens(value: unknown): value is CognitoTokens {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const idToken = Reflect.get(value, "id_token");
  const expiresIn = Reflect.get(value, "expires_in");
  return typeof idToken === "string" && idToken.length >= 100 &&
    (expiresIn === undefined || (typeof expiresIn === "number" && Number.isFinite(expiresIn)));
}

function clearTemporaryCookies(response: NextResponse): void {
  const options = { httpOnly: true, secure: secureCookie(), sameSite: "lax" as const, path: "/api/auth/callback", maxAge: 0 };
  response.cookies.set(authCookieNames.oauthState, "", options);
  response.cookies.set(authCookieNames.pkceVerifier, "", options);
}

function errorResponse(message: string, status: number): NextResponse {
  const response = NextResponse.json({ code: "authentication_failed", message }, { status, headers: { "Cache-Control": "no-store" } });
  clearTemporaryCookies(response);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(authCookieNames.oauthState)?.value;
  const verifier = request.cookies.get(authCookieNames.pkceVerifier)?.value;

  if (error) return errorResponse("Cognito sign-in was cancelled or rejected", 401);
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return errorResponse("The sign-in response could not be verified", 400);
  }

  try {
    const { domain, clientId, clientSecret } = cognitoHostedUiConfiguration();
    const tokenUrl = new URL("/oauth2/token", domain);
    const tokenHeaders = new Headers({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
    if (clientSecret) tokenHeaders.set("Authorization", `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`);
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: tokenHeaders,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: cognitoCallbackUrl().toString(),
        code_verifier: verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const payload: unknown = await tokenResponse.json();
    if (!tokenResponse.ok || !isCognitoTokens(payload)) return errorResponse("Cognito did not issue a valid session", 401);

    await verifyDashboardAccess(payload.id_token);
    const response = NextResponse.redirect(applicationBaseUrl(), 303);
    response.cookies.set(authCookieNames.access, payload.id_token, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: Math.min(Math.max(payload.expires_in ?? 3600, 60), 3600),
    });
    clearTemporaryCookies(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (callbackError: unknown) {
    const status = callbackError instanceof DashboardApiUnauthorizedError ? callbackError.status : 503;
    return errorResponse(status === 403 ? "Your account does not have dashboard access" : "Authentication could not be completed", status);
  }
}
