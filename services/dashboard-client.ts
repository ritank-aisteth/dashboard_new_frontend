import { isDashboardMetricView, isDashboardSessionStatus, isDashboardSnapshot } from "@/lib/dashboard-contract";
import type { DashboardIdentity, DashboardMetricView, DashboardSnapshot, ReportingRange } from "@/lib/dashboard-contract";

export class DashboardClientError extends Error {
  readonly status: number;

  constructor(status = 503) {
    super(status === 401 ? "Authentication is required" : status === 403 ? "Dashboard access is denied" : "Dashboard data is temporarily unavailable");
    this.name = "DashboardClientError";
    this.status = status;
  }
}

export interface OrganizationCreateInput {
  name: string; abdm_service_id: string; address: string; city: string; state: string;
  country: string; pincode: string; location: { latitude: number; longitude: number };
}

export interface ProviderCreateInput {
  login: string; name: string; role: string; specialty: string; tenant_id: string;
  address: string; city: string; state: string; country: string; pincode: string;
  location: { latitude: number; longitude: number };
  email: Array<{ type: string; value: string; is_primary: boolean }>;
  phone: Array<{ type: string; value: string; country_code?: string; is_primary: boolean }>;
  subscription_duration_years: 1 | 3;
}

async function postDashboardResource(path: string, payload: OrganizationCreateInput | ProviderCreateInput): Promise<string> {
  try {
    const response = await fetch(path, {
      method: "POST", cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new DashboardClientError(response.status);
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DashboardClientError();
    const requestId = Reflect.get(value, "request_id");
    if (typeof requestId !== "string" || !requestId) throw new DashboardClientError();
    return requestId;
  } catch (error: unknown) {
    if (error instanceof DashboardClientError) throw error;
    throw new DashboardClientError();
  }
}

export async function createOrganization(payload: OrganizationCreateInput): Promise<string> {
  return postDashboardResource("/api/dashboard/organizations", payload);
}

export async function createProvider(payload: ProviderCreateInput): Promise<string> {
  return postDashboardResource("/api/dashboard/providers", payload);
}

export async function getDashboardSession(): Promise<DashboardIdentity | null> {
  try {
    const response = await fetch("/api/auth/status", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isDashboardSessionStatus(value) ? value.user : null;
  } catch {
    return null;
  }
}

export async function exportDashboardSummary(organizationIds: readonly string[], range: ReportingRange): Promise<void> {
  try {
    const response = await fetch("/api/dashboard/export-summary", {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ organizationIds, range }),
    });
    if (!response.ok) throw new DashboardClientError(response.status);
  } catch (error: unknown) {
    if (error instanceof DashboardClientError) throw error;
    throw new DashboardClientError();
  }
}

export async function renewProviderSubscription(providerId: string, durationYears: 1 | 3): Promise<void> {
  try {
    const response = await fetch("/api/dashboard/renew-subscription", {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, durationYears }),
    });
    if (!response.ok) throw new DashboardClientError(response.status);
  } catch (error: unknown) {
    if (error instanceof DashboardClientError) throw error;
    throw new DashboardClientError();
  }
}

export async function getDashboard(range: ReportingRange): Promise<DashboardSnapshot> {
  const query = new URLSearchParams({ date_from: range.dateFrom, date_to: range.dateTo });
  try {
    const response = await fetch(`/api/dashboard?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new DashboardClientError(response.status);
    const value: unknown = await response.json();
    if (!isDashboardSnapshot(value)) throw new DashboardClientError();
    return value;
  } catch (error: unknown) {
    if (error instanceof DashboardClientError) throw error;
    throw new DashboardClientError();
  }
}

export async function getScopedDashboard(kind:"organization"|"provider",id:string,range:ReportingRange):Promise<DashboardMetricView[]>{
  const query=new URLSearchParams({kind,id,date_from:range.dateFrom,date_to:range.dateTo});
  const response=await fetch(`/api/dashboard/scoped?${query.toString()}`,{method:"GET",cache:"no-store",headers:{Accept:"application/json"}});
  if(!response.ok)throw new DashboardClientError(response.status);
  const value:unknown=await response.json();
  if(typeof value!=="object"||value===null||Array.isArray(value))throw new DashboardClientError();
  const metrics=Reflect.get(value,"metrics");
  if(!Array.isArray(metrics)||!metrics.every(isDashboardMetricView))throw new DashboardClientError();
  return metrics;
}
