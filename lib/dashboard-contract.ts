import type { Clinician, Organization, UiIconName } from "@/lib/types";

export interface DashboardMetricView {
  key: string;
  label: string;
  value: string;
  changePercent: number | null;
  icon: UiIconName;
  color: string;
  soft: string;
  series: readonly number[];
  labels: readonly string[];
}

export interface AihBuddyView {
  totalScreenings: number;
  completedScreenings: number;
  awaitingReview: number;
  highRiskFlags: number;
  activeProviders: number;
}

export interface BreakdownItemView {
  label: string;
  count: number;
  percentage: number;
}

export interface PatientBreakdownView {
  total: number;
  auscultationType: BreakdownItemView[];
  genderDistribution: BreakdownItemView[];
  ageGroupDistribution: BreakdownItemView[];
}

export interface MurmurBreakdownView {
  totalReports: number;
  genderDistribution: BreakdownItemView[];
  ageGroupDistribution: BreakdownItemView[];
}

export interface LocationView {
  organizationId: string;
  organizationName: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  providerCount: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  organizations: Organization[];
  clinicians: Clinician[];
  metrics: DashboardMetricView[];
  aihBuddy: AihBuddyView;
  patientBreakdown: PatientBreakdownView;
  murmurBreakdown: MurmurBreakdownView;
  heartSoundDistribution: BreakdownItemView[];
  lungSoundDistribution: BreakdownItemView[];
  locations: LocationView[];
}

export interface ReportingRange {
  dateFrom: string;
  dateTo: string;
}

export interface DashboardIdentity {
  login: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string | null;
}

export interface DashboardSessionStatus {
  authenticated: true;
  user: DashboardIdentity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

const iconNames = new Set<string>(["dashboard","building","users","map","plus","activity","shield","bell","menu","calendar","download","search","heart","lungs","report","patient","stethoscope","chevron","logout","info"] satisfies readonly UiIconName[]);

function isOrganization(value: unknown): value is Organization {
  if (!isRecord(value)) return false;
  const strings = ["id","name","code","city","state","country","created"];
  return strings.every((key)=>hasString(value,key))
    && (value["status"] === "Active" || value["status"] === "Review")
    && ["clinicians","patients","recordings"].every((key)=>hasNumber(value,key));
}

function isClinician(value: unknown): value is Clinician {
  if (!isRecord(value)) return false;
  return ["id","name","specialty","organization"].every((key)=>hasString(value,key))
    && (value["role"] === "Doctor" || value["role"] === "Nurse")
    && (value["status"] === "Active" || value["status"] === "Invited")
    && hasNumber(value,"patients")
    && (value["subscriptionStatus"] === "Active" || value["subscriptionStatus"] === "Inactive" || value["subscriptionStatus"] === "Expired")
    && (value["subscriptionPlan"] === null || typeof value["subscriptionPlan"] === "string")
    && (value["subscriptionEndDate"] === null || typeof value["subscriptionEndDate"] === "string");
}

export function isDashboardMetricView(value: unknown): value is DashboardMetricView {
  if (!isRecord(value)) return false;
  const change = value["changePercent"];
  const icon = value["icon"];
  return ["key","label","value","color","soft"].every((key)=>hasString(value,key))
    && (change === null || (typeof change === "number" && Number.isFinite(change)))
    && typeof icon === "string" && iconNames.has(icon)
    && Array.isArray(value["series"]) && value["series"].every((item)=>typeof item === "number" && Number.isFinite(item))
    && Array.isArray(value["labels"]) && value["labels"].every((item)=>typeof item === "string");
}

function isBreakdownItem(value: unknown): value is BreakdownItemView {
  return isRecord(value) && hasString(value, "label") && hasNumber(value, "count") && hasNumber(value, "percentage");
}

function isPatientBreakdown(value: unknown): value is PatientBreakdownView {
  return isRecord(value) && hasNumber(value, "total")
    && ["auscultationType", "genderDistribution", "ageGroupDistribution"].every((key) => Array.isArray(value[key]) && value[key].every(isBreakdownItem));
}

function isMurmurBreakdown(value: unknown): value is MurmurBreakdownView {
  return isRecord(value) && hasNumber(value, "totalReports")
    && ["genderDistribution", "ageGroupDistribution"].every((key) => Array.isArray(value[key]) && value[key].every(isBreakdownItem));
}

function isLocation(value:unknown):value is LocationView {
  return isRecord(value) && ["organizationId","organizationName","city","state","country"].every((key)=>hasString(value,key)) && ["latitude","longitude","providerCount"].every((key)=>hasNumber(value,key));
}

export function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (!isRecord(value) || !hasString(value, "generatedAt")) return false;
  if (!Array.isArray(value["organizations"]) || !value["organizations"].every(isOrganization)) return false;
  if (!Array.isArray(value["clinicians"]) || !value["clinicians"].every(isClinician)) return false;
  if (!Array.isArray(value["metrics"]) || !value["metrics"].every(isDashboardMetricView)) return false;
  if (!isPatientBreakdown(value["patientBreakdown"])) return false;
  if (!isMurmurBreakdown(value["murmurBreakdown"])) return false;
  if (!["heartSoundDistribution", "lungSoundDistribution"].every((key) => Array.isArray(value[key]) && value[key].every(isBreakdownItem))) return false;
  if (!Array.isArray(value["locations"]) || !value["locations"].every(isLocation)) return false;
  const buddy = value["aihBuddy"];
  if (!isRecord(buddy)) return false;
  return ["totalScreenings", "completedScreenings", "awaitingReview", "highRiskFlags", "activeProviders"]
    .every((key) => hasNumber(buddy, key));
}

export function isDashboardSessionStatus(value: unknown): value is DashboardSessionStatus {
  if (!isRecord(value) || value["authenticated"] !== true) return false;
  const user = value["user"];
  return isRecord(user)
    && ["login", "name", "role", "tenantId"].every((key) => hasString(user, key))
    && (user["tenantName"] === null || typeof user["tenantName"] === "string");
}
