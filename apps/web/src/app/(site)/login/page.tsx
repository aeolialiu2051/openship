import { CLOUD_DASHBOARD_URL, resolveDashboardPageUrl } from "@repo/core";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginRedirect() {
  redirect(resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/login"));
}
