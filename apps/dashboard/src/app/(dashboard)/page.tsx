import DashboardHomeClient from "./DashboardHomeClient";

/**
 * Render the dashboard shell immediately. Project data is filled from the
 * shared client cache (and revalidated in the background) instead of holding
 * the entire RSC response behind the projects/home API round-trip.
 */
export default function DashboardHome() {
  return <DashboardHomeClient />;
}
