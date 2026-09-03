import { NextResponse } from "next/server";

import { cognitoClientConfiguration } from "@/services/cognito-auth.server";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(cognitoClientConfiguration(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "auth_unavailable", message: "Authentication is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
