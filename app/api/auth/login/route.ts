import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import {
  authCookieNames,
  cognitoCallbackUrl,
  cognitoHostedUiConfiguration,
  secureCookie,
} from "@/services/cognito-auth.server";

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function GET(): NextResponse {
  try {
    const { domain, clientId } = cognitoHostedUiConfiguration();
    const state = base64Url(randomBytes(32));
    const verifier = base64Url(randomBytes(64));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const authorizationUrl = new URL("/oauth2/authorize", domain);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("redirect_uri", cognitoCallbackUrl().toString());
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("code_challenge", challenge);

    const response = NextResponse.redirect(authorizationUrl, 303);
    const cookieOptions = {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax" as const,
      path: "/api/auth/callback",
      maxAge: 600,
    };
    response.cookies.set(authCookieNames.oauthState, state, cookieOptions);
    response.cookies.set(authCookieNames.pkceVerifier, verifier, cookieOptions);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json(
      { code: "auth_unavailable", message: "Hosted authentication is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
