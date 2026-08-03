"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AppWindow, LayoutDashboard, ScrollText, Settings2, Users } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { adminCopy } from "./admin-copy";

export function AdminNav() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  const items = [
    { href: "/admin", label: copy.overview, icon: LayoutDashboard },
    { href: "/admin/users", label: copy.users, icon: Users },
    { href: "/admin/apps", label: copy.applications, icon: AppWindow },
    { href: "/admin/access-logs", label: copy.accessLogs, icon: Activity },
    { href: "/admin/activity", label: copy.activityLogs, icon: ScrollText },
    { href: "/admin/config", label: copy.runtimeConfig, icon: Settings2 },
  ];

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border/50 bg-card p-1.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-foreground/[0.08] text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            }`}
          >
            <Icon className="size-4" strokeWidth={1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
