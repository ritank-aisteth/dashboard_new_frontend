import { NextRequest, NextResponse } from "next/server";

function cognitoEndpoint(): string | null {
  const userPoolId = process.env["COGNITO_USER_POOL_ID"]?.trim();
  const region = userPoolId?.match(/^([a-z0-9-]+)_[A-Za-z0-9]+$/)?.[1];

  return region ? `https://cognito-idp.${region}.amazonaws.com` : null;
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const developmentDirective = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const upgradeDirective = process.env.NODE_ENV === "production" ? " upgrade-insecure-requests;" : "";
  const allowedConnections = ["'self'", cognitoEndpoint()].filter(Boolean).join(" ");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentDirective}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${allowedConnections}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "media-src 'none'",
    "worker-src 'self' blob:",
  ].join("; ") + `;${upgradeDirective}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
