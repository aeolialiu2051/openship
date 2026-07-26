"use client";

import React, { useEffect, useRef } from "react";

export interface TabDef<K extends string = string> {
  key: K;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** When true the tab is not rendered (e.g. Backup only for stateful services). */
  hidden?: boolean;
}

interface TabsProps<K extends string> {
  tabs: TabDef<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

/**
 * Underline tab strip — the shared version of the pattern hand-rolled across
 * billing, the servers detail page, and the project logs view (border-b strip,
 * `px-4 py-2.5` items, `bg-primary` active underline). Controlled: the caller
 * owns the active `value`.
 */
export function Tabs<K extends string>({ tabs, value, onChange, className = "" }: TabsProps<K>) {
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div className={`flex items-center gap-1 overflow-x-auto border-b border-border/50 scrollbar-hide ${className}`}>
      {tabs
        .filter((tab) => !tab.hidden)
        .map(({ key, label, icon: Icon }) => {
          const active = key === value;
          return (
            <button
              key={key}
              ref={active ? activeTabRef : undefined}
              type="button"
              onClick={() => onChange(key)}
              className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              {Icon && <Icon className="size-4" />}
              {label}
              {active && (
                <span className="absolute bottom-0 start-0 end-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
    </div>
  );
}

export default Tabs;
