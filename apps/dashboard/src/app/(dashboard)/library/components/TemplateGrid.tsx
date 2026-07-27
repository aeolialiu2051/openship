"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { frameworks } from "@/components/import-project/Frameworks";
import { encodeTemplateSlug } from "@/utils/repoSlug";
import { hasStarterTemplate } from "@/lib/starterTemplates";
import { useI18n } from "@/components/i18n-provider";

export function TemplateGrid() {
  const { t } = useI18n();
  const router = useRouter();

  const handleSelect = (stackId: string) => {
    if (!hasStarterTemplate(stackId)) return;
    router.push(`/deploy/${encodeTemplateSlug(stackId)}`);
  };

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {frameworks
          .filter((fw) => fw.id !== "static" && fw.id !== "webmail")
          .map((fw) => {
            const available = hasStarterTemplate(fw.id);
            return (
          <button
            key={fw.id}
            onClick={() => handleSelect(fw.id)}
            disabled={!available}
            title={available ? fw.name : t.deploy.targetStep.comingSoon}
            className="relative flex flex-col items-center gap-3 p-5 rounded-xl border border-border/50 bg-background hover:bg-muted/40 hover:border-border transition-all group disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-background disabled:hover:border-border/50"
          >
            <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center group-hover:scale-105 transition-transform">
              {fw.icon("hsl(var(--foreground))")}
            </div>
            <span className="text-sm font-medium text-foreground">{fw.name}</span>
            {!available && (
              <span className="absolute end-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {t.deploy.targetStep.comingSoon}
              </span>
            )}
          </button>
            );
          })}
      </div>
    </div>
  );
}
