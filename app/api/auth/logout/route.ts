import { NextResponse } from "next/server";

import { applicationBaseUrl, authCookieNames, cognitoHostedUiConfiguration, secureCookie } from "@/services/cognito-auth.server";

function clearAuthenticationCookies(response: NextResponse): void {
  response.cookies.set(authCookieNames.access, "", { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function POST(): Promise<NextResponse> {
  try {
    const { domain, clientId } = cognitoHostedUiConfiguration();
    const logoutUrl = new URL("/logout", domain);
    logoutUrl.searchParams.set("client_id", clientId);
    logoutUrl.searchParams.set("logout_uri", applicationBaseUrl().toString());
    const response = NextResponse.redirect(logoutUrl, 303);
    clearAuthenticationCookies(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.json({ code: "auth_unavailable", message: "Authentication is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    clearAuthenticationCookies(response);
    return response;
  }
}
