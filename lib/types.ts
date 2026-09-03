export type Role = "Super Admin" | "Organization Admin" | "Clinical Viewer";
export const roles: readonly Role[] = ["Super Admin", "Organization Admin", "Clinical Viewer"];

export type UiIconName = "dashboard" | "building" | "users" | "map" | "plus" | "activity" | "shield" | "bell" | "menu" | "calendar" | "download" | "search" | "heart" | "lungs" | "report" | "patient" | "stethoscope" | "chevron" | "logout" | "info";
export type View = "hub" | "overview" | "aih-buddy" | "organizations" | "organization-detail" | "clinicians" | "clinician-detail" | "locations" | "onboard-organization" | "onboard-clinician" | "activity";

export interface Organization {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  country: string;
  created: string;
  status: "Active" | "Review";
  clinicians: number;
  patients: number;
  recordings: number;
}

export interface Clinician {
  id: string;
  name: string;
  role: "Doctor" | "Nurse";
  specialty: string;
  organization: string;
  status: "Active" | "Invited";
  patients: number;
  subscriptionStatus: "Active" | "Inactive" | "Expired";
  subscriptionPlan: string | null;
  subscriptionEndDate: string | null;
}

export interface ActivityEvent {
  title: string;
  detail: string;
  time: string;
  kind: UiIconName;
}
