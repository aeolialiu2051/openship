import { CLOUD_DASHBOARD_URL } from "@repo/core";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginRedirect() {
  redirect(`${CLOUD_DASHBOARD_URL.replace(/\/+$/, "")}/login`);
}
