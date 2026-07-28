import { notFound } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { PageContainer } from "@/components/ui/PageContainer";
import { AdminHeader } from "./_components/admin-header";
import { AdminNav } from "./_components/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") notFound();

  return (
    <PageContainer>
      <AdminHeader />
      <AdminNav />
      {children}
    </PageContainer>
  );
}
