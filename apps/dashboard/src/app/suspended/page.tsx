import { Ban } from "lucide-react";
import { getSupportEmail } from "@/lib/support-email";
import { getDeploymentInfoOrNull } from "@/lib/server/session";

export const metadata = {
  title: "页面已下架",
  robots: { index: false, follow: false },
};

export default async function SuspendedPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site } = await searchParams;
  const deploymentInfo = await getDeploymentInfoOrNull();
  const supportEmail = deploymentInfo?.supportEmail || getSupportEmail();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-border/60 bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-bg text-danger">
          <Ban className="size-7" aria-hidden="true" />
        </div>
        {site ? (
          <p className="mt-5 truncate text-xs font-medium text-muted-foreground">{site}</p>
        ) : null}
        <h1 className="mt-3 text-2xl font-semibold text-foreground">页面已经被下架</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          因为违反平台规定，该页面已经被下架。如果你对此处理有异议，请联系平台管理员。
        </p>
        {supportEmail ? (
          <a
            href={`mailto:${supportEmail}`}
            className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            {supportEmail}
          </a>
        ) : null}
        <p className="mt-7 text-xs leading-5 text-muted-foreground/70">
          This page has been taken offline for violating platform rules. Contact support if you wish to appeal.
        </p>
      </section>
    </main>
  );
}
