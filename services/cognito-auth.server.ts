import "server-only";

export const authCookieNames = {
  access: "aisteth_access_token",
  oauthState: "aisteth_oauth_state",
  pkceVerifier: "aisteth_pkce_verifier",
} as const;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.includes("CHANGE_ME") || value.includes("YOUR_")) throw new Error(`${name} is not configured`);
  return value;
}

export function cognitoClientConfiguration(): { userPoolId: string; clientId: string } {
  return {
    userPoolId: requiredEnvironment("COGNITO_USER_POOL_ID"),
    clientId: requiredEnvironment("COGNITO_CLIENT_ID"),
  };
}

export function cognitoHostedUiConfiguration(): { domain: URL; clientId: string; clientSecret: string | null } {
  const configuration = cognitoClientConfiguration();
  const domain = new URL(requiredEnvironment("COGNITO_DOMAIN"));
  const region = configuration.userPoolId.split("_", 1)[0];
  const expectedSuffix = `.auth.${region}.amazoncognito.com`;
  if (domain.protocol !== "https:" || !domain.hostname.endsWith(expectedSuffix)) {
    throw new Error("COGNITO_DOMAIN is not valid for the configured User Pool region");
  }
  if (domain.username || domain.password || domain.search || domain.hash || domain.pathname !== "/") {
    throw new Error("COGNITO_DOMAIN contains unsupported URL components");
  }
  const clientSecret = process.env["COGNITO_CLIENT_SECRET"]?.trim() || null;
  return { domain, clientId: configuration.clientId, clientSecret };
}

export function applicationBaseUrl(): URL {
  const url = new URL(requiredEnvironment("APP_BASE_URL"));
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("APP_BASE_URL must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("APP_BASE_URL contains unsupported URL components");
  return url;
}

export function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function cognitoCallbackUrl(): URL {
  return new URL("/api/auth/callback", applicationBaseUrl());
}
