import { withDashboardBasePath } from "@/lib/dashboard-path";

export default function DashboardBootLoading() {
  return (
    <div className="dashboard-boot-loading" role="status" aria-live="polite">
      <img src={withDashboardBasePath("/apple-touch-icon.png")} alt="" />
      <span>Vibrail</span>
      <i aria-hidden="true" />
    </div>
  );
}
