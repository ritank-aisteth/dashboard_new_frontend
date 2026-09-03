import { DashboardApp } from "@/components/dashboard-app";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  return <DashboardApp />;
}
