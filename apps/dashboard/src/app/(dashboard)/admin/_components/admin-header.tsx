"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { adminCopy } from "./admin-copy";

export function AdminHeader() {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ShieldCheck className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-medium text-foreground/90">{copy.section}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </div>
    </div>
  );
}
