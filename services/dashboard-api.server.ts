import "server-only";

import type { AihBuddyView, BreakdownItemView, DashboardIdentity, DashboardMetricView, DashboardSnapshot, LocationView, MurmurBreakdownView, PatientBreakdownView, ReportingRange } from "@/lib/dashboard-contract";
import type { Clinician, Organization, UiIconName } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

const metricPresentation: Readonly<Record<string, { key: string; icon: UiIconName; color: string; soft: string }>> = {
  organizations: { key: "organizations", icon: "building", color: "#2364c4", soft: "#e8f1ff" },
  providers: { key: "doctors", icon: "stethoscope", color: "#178a62", soft: "#e7f7f1" },
  patients: { key: "patients", icon: "patient", color: "#6d50d7", soft: "#f0ecff" },
  heart_recordings: { key: "heart", icon: "heart", color: "#dc6f24", soft: "#fff0e3" },
  lung_recordings: { key: "lung", icon: "lungs", color: "#1685a8", soft: "#e5f6fa" },
  lab_reports: { key: "lab", icon: "report", color: "#a35a97", soft: "#f8eefa" },
  qrisk_screenings: { key: "qrisk", icon: "activity", color: "#b27814", soft: "#fff5df" },
  normal_heart_sound_reports: { key: "normal", icon: "shield", color: "#278153", soft: "#eaf7f0" },
  murmur_heart_sound_reports: { key: "murmur", icon: "heart", color: "#c24161", soft: "#fcecf1" },
};

export class DashboardApiUnavailableError extends Error {
  readonly status: number;
  constructor(status = 503) {
    super("Dashboard data is temporarily unavailable");
    this.name = "DashboardApiUnavailableError";
    this.status = status;
  }
}

export class DashboardApiUnauthorizedError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super("Authentication is required");
    this.name = "DashboardApiUnauthorizedError";
    this.status = status;
  }
}

function backendBaseUrl(): URL {
  const configured = process.env["DASHBOARD_API_BASE_URL"] ?? "http://127.0.0.1:8000";
  const url = new URL(configured);
  if (!(["http:", "https:"] as const).some((protocol) => protocol === url.protocol)) {
    throw new Error("DASHBOARD_API_BASE_URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) throw new Error("Credentials must not be embedded in DASHBOARD_API_BASE_URL");
  return url;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: JsonRecord, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function numberField(record: JsonRecord, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordArray(record: JsonRecord, key: string): JsonRecord[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase() ?? "").join("") || "ORG";
}

function safeDateLabel(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(parsed);
}

async function getJson(path: string, accessToken: string, range?: ReportingRange): Promise<JsonRecord> {
  const url = new URL(path, backendBaseUrl());
  if (range) {
    url.searchParams.set("date_from", range.dateFrom);
    url.searchParams.set("date_to", range.dateTo);
    if (range.dateFrom === "2018-01-01") url.searchParams.set("all_time", "true");
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) throw new DashboardApiUnauthorizedError(response.status);
    if (!response.ok) throw new DashboardApiUnavailableError(response.status);
    const value: unknown = await response.json();
    if (!isRecord(value)) throw new DashboardApiUnavailableError();
    return value;
  } catch (error: unknown) {
    if (error instanceof DashboardApiUnavailableError || error instanceof DashboardApiUnauthorizedError) throw error;
    throw new DashboardApiUnavailableError();
  }
}

async function postJson(path: string, payload: unknown, accessToken: string): Promise<JsonRecord> {
  const url = new URL(path, backendBaseUrl());
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) throw new DashboardApiUnauthorizedError(response.status);
    if (!response.ok) throw new DashboardApiUnavailableError(response.status);
    const value: unknown = await response.json();
    if (!isRecord(value)) throw new DashboardApiUnavailableError();
    return value;
  } catch (error: unknown) {
    if (error instanceof DashboardApiUnavailableError || error instanceof DashboardApiUnauthorizedError) throw error;
    throw new DashboardApiUnavailableError();
  }
}

export async function createDashboardOrganization(payload: unknown, accessToken: string): Promise<JsonRecord> {
  return postJson("/api/v1/onboarding/organizations", payload, accessToken);
}

export async function createDashboardProvider(payload: unknown, accessToken: string): Promise<JsonRecord> {
  return postJson("/api/v1/onboarding/providers", payload, accessToken);
}

export async function verifyDashboardAccess(idToken: string): Promise<void> {
  await getJson("/api/v1/auth/me", idToken);
}

export async function getDashboardIdentity(idToken: string): Promise<DashboardIdentity> {
  const identity = await getJson("/api/v1/auth/me", idToken);
  return {
    login: stringField(identity, "login"),
    name: stringField(identity, "name", stringField(identity, "login")),
    role: stringField(identity, "role"),
    tenantId: stringField(identity, "tenant_id"),
    tenantName: identity["tenant_name"] === null ? null : stringField(identity, "tenant_name") || null,
  };
}

export async function exportDashboardSummary(
  organizationIds: readonly string[],
  range: ReportingRange,
  idToken: string,
): Promise<void> {
  const url = new URL("/api/v1/reports/summary", backendBaseUrl());
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_ids: organizationIds,
        date_from: range.dateFrom,
        date_to: range.dateTo,
        selected_date: "Custom",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 401 || response.status === 403) throw new DashboardApiUnauthorizedError(response.status);
    if (!response.ok) throw new DashboardApiUnavailableError();
  } catch (error: unknown) {
    if (error instanceof DashboardApiUnavailableError || error instanceof DashboardApiUnauthorizedError) throw error;
    throw new DashboardApiUnavailableError();
  }
}

function mapMetric(source: JsonRecord): DashboardMetricView | null {
  const sourceKey = stringField(source, "key");
  const presentation = metricPresentation[sourceKey];
  if (!presentation) return null;
  const points = recordArray(source, "series");
  const change = source["change_percent"];
  return {
    key: presentation.key,
    label: stringField(source, "label", sourceKey),
    value: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(numberField(source, "total")),
    changePercent: typeof change === "number" && Number.isFinite(change) ? change : null,
    icon: presentation.icon,
    color: presentation.color,
    soft: presentation.soft,
    series: points.map((point) => numberField(point, "value")),
    labels: points.map((point) => safeDateLabel(stringField(point, "date"))),
  };
}

function mapOrganization(source: JsonRecord): Organization {
  const status = stringField(source, "status").toLowerCase() === "active" ? "Active" : "Review";
  const name = stringField(source, "name", "Unnamed organization");
  return {
    id: stringField(source, "id"),
    name,
    code: initials(name),
    city: stringField(source, "city", "Unknown"),
    state: stringField(source, "state", "Unknown"),
    country: stringField(source, "country", "Unknown"),
    created: stringField(source, "date_created").slice(0, 10),
    status,
    clinicians: numberField(source, "provider_count"),
    patients: numberField(source, "patient_count"),
    recordings: numberField(source, "recording_count"),
  };
}

function mapClinician(source: JsonRecord): Clinician {
  const rawRole = stringField(source, "role").toLowerCase();
  const rawSubscriptionStatus = stringField(source, "subscription_status").toLowerCase();
  return {
    id: stringField(source, "id"),
    name: stringField(source, "name", "Unnamed professional"),
    role: rawRole.includes("nurse") ? "Nurse" : "Doctor",
    specialty: stringField(source, "specialty", "General"),
    organization: stringField(source, "organization_name", "Unknown organization"),
    status: stringField(source, "status").toLowerCase() === "active" ? "Active" : "Invited",
    patients: numberField(source, "patient_count"),
    subscriptionStatus: rawSubscriptionStatus === "active" ? "Active" : rawSubscriptionStatus === "expired" ? "Expired" : "Inactive",
    subscriptionPlan: source["subscription_plan"] === null ? null : stringField(source, "subscription_plan") || null,
    subscriptionEndDate: source["subscription_end_date"] === null ? null : stringField(source, "subscription_end_date") || null,
  };
}

export async function renewProviderSubscription(providerId: string, durationYears: 1 | 3, idToken: string): Promise<void> {
  const url = new URL(`/api/v1/providers/${encodeURIComponent(providerId)}/subscription/renew`, backendBaseUrl());
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ duration_years: durationYears }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) throw new DashboardApiUnauthorizedError(response.status);
    if (!response.ok) throw new DashboardApiUnavailableError();
  } catch (error: unknown) {
    if (error instanceof DashboardApiUnavailableError || error instanceof DashboardApiUnauthorizedError) throw error;
    throw new DashboardApiUnavailableError();
  }
}

function mapBuddy(source: JsonRecord): AihBuddyView {
  return {
    totalScreenings: numberField(source, "total_screenings"),
    completedScreenings: numberField(source, "completed_screenings"),
    awaitingReview: numberField(source, "awaiting_review"),
    highRiskFlags: numberField(source, "high_risk_flags"),
    activeProviders: numberField(source, "active_providers"),
  };
}

function mapBreakdownItems(source: JsonRecord, key: string): BreakdownItemView[] {
  return recordArray(source, key).map((item) => ({ label: stringField(item, "label"), count: numberField(item, "count"), percentage: numberField(item, "percentage") }));
}

function mapPatientBreakdown(source: JsonRecord): PatientBreakdownView {
  return { total: numberField(source, "total"), auscultationType: mapBreakdownItems(source, "auscultation_type"), genderDistribution: mapBreakdownItems(source, "gender_distribution"), ageGroupDistribution: mapBreakdownItems(source, "age_group_distribution") };
}

function mapLocation(source:JsonRecord):LocationView {
  const point=isRecord(source["location"])?source["location"]:{};
  return {organizationId:stringField(source,"organization_id"),organizationName:stringField(source,"organization_name"),city:stringField(source,"city"),state:stringField(source,"state"),country:stringField(source,"country"),latitude:numberField(point,"latitude"),longitude:numberField(point,"longitude"),providerCount:numberField(source,"provider_count")};
}

function mapMurmurBreakdown(source: JsonRecord): MurmurBreakdownView {
  return { totalReports: numberField(source, "total_reports"), genderDistribution: mapBreakdownItems(source, "gender_distribution"), ageGroupDistribution: mapBreakdownItems(source, "age_group_distribution") };
}

export async function getDashboardSnapshot(range: ReportingRange, accessToken: string): Promise<DashboardSnapshot> {
  const identity = await getDashboardIdentity(accessToken);
  const isSuperAdmin = identity.role.toLowerCase().replaceAll("_", "") === "superadmin";
  const [overview, organizations, clinicians, buddy, locations] = await Promise.all([
    getJson("/api/v1/dashboard/overview", accessToken, range),
    getJson("/api/v1/organizations?limit=100", accessToken),
    getJson("/api/v1/providers?limit=2000", accessToken),
    isSuperAdmin ? getJson("/api/v1/dashboard/aih-buddy", accessToken, range) : Promise.resolve({}),
    getJson("/api/v1/locations", accessToken),
  ]);
  const metrics = recordArray(overview, "metrics").map(mapMetric).filter((metric): metric is DashboardMetricView => metric !== null);
  const organizationSources = recordArray(organizations, "items");
  const clinicianSources = recordArray(clinicians, "items");
  const providerCountsByOrganizationId = new Map<string, number>();
  const providerCountsByOrganizationName = new Map<string, number>();
  for (const source of clinicianSources) {
    const organizationId = stringField(source, "organization_id", stringField(source, "tenant_id"));
    const organizationName = stringField(source, "organization_name", stringField(source, "tenant_name")).trim().toLocaleLowerCase();
    if (organizationId) providerCountsByOrganizationId.set(organizationId, (providerCountsByOrganizationId.get(organizationId) ?? 0) + 1);
    if (organizationName) providerCountsByOrganizationName.set(organizationName, (providerCountsByOrganizationName.get(organizationName) ?? 0) + 1);
  }
  const mappedOrganizations = organizationSources.map(mapOrganization).map((organization) => ({
    ...organization,
    clinicians: providerCountsByOrganizationId.get(organization.id)
      ?? providerCountsByOrganizationName.get(organization.name.trim().toLocaleLowerCase())
      ?? organization.clinicians,
  }));
  return {
    generatedAt: stringField(overview, "generated_at", new Date().toISOString()),
    organizations: mappedOrganizations,
    clinicians: clinicianSources.map(mapClinician),
    metrics,
    aihBuddy: mapBuddy(buddy),
    patientBreakdown: mapPatientBreakdown(isRecord(overview["patient_breakdown"]) ? overview["patient_breakdown"] : {}),
    murmurBreakdown: mapMurmurBreakdown(isRecord(overview["murmur_breakdown"]) ? overview["murmur_breakdown"] : {}),
    heartSoundDistribution: mapBreakdownItems(overview, "heart_sound_distribution"),
    lungSoundDistribution: mapBreakdownItems(overview, "lung_sound_distribution"),
    locations: recordArray(locations,"items").map(mapLocation),
  };
}

export async function getScopedDashboardMetrics(kind: "organization" | "provider", id: string, range: ReportingRange, accessToken: string): Promise<DashboardMetricView[]> {
  const path = kind === "organization" ? `/api/v1/organizations/${encodeURIComponent(id)}/dashboard` : `/api/v1/providers/${encodeURIComponent(id)}/dashboard`;
  const response = await getJson(path, accessToken, range);
  return recordArray(response, "metrics").map(mapMetric).filter((metric): metric is DashboardMetricView => metric !== null);
}
