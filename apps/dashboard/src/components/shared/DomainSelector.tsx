"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Globe, Loader2, Plus } from "lucide-react";
import { useAddDomainModal } from "@/components/domains/DomainModal";
import { useI18n } from "@/components/i18n-provider";
import { domainSettingsApi, type DomainSettingsView } from "@/lib/api";

export interface DomainSelectorProps {
  value?: string | null;
  onSelect: (domain: string) => void;
  disabled?: boolean;
  compact?: boolean;
  dropUp?: boolean;
  dropdownInline?: boolean;
  allowPrefix?: boolean;
}

function isConnected(item: DomainSettingsView) {
  return Boolean(item.verifiedAt) && !item.lastVerificationError;
}

function normalizePrefixInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+/, "")
    .replace(/\.{2,}/g, ".");
}

function hostnameFor(prefix: string, domain: string) {
  const cleanPrefix = prefix.replace(/\.+$/, "");
  return cleanPrefix ? `${cleanPrefix}.${domain}` : domain;
}

/** Shared custom-domain picker backed by the domains settings page. */
export default function DomainSelector({
  value,
  onSelect,
  disabled = false,
  compact = false,
  dropUp = false,
  dropdownInline = false,
  allowPrefix = true,
}: DomainSelectorProps) {
  const { t } = useI18n();
  const w = t.widgets.shared.domainSelector;
  const [domains, setDomains] = useState<DomainSettingsView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const lastEmittedValue = useRef<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const showAddDomain = useAddDomainModal();

  const fetchDomains = useCallback(async (preferredDomain?: string) => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const items = await domainSettingsApi.list();
      setDomains(items);
      if (preferredDomain) onSelect(preferredDomain);
    } catch {
      setDomains([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
    // onSelect may be an inline state adapter; fetching should not restart when
    // its identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    if (!open) return;
    const closeWhenFocusLeaves = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeWhenFocusLeaves, true);
    document.addEventListener("focusin", closeWhenFocusLeaves);
    return () => {
      document.removeEventListener("pointerdown", closeWhenFocusLeaves, true);
      document.removeEventListener("focusin", closeWhenFocusLeaves);
    };
  }, [open]);

  const openAddDomain = () => {
    setOpen(false);
    showAddDomain({
      onCreated: (created) => {
        setDomains((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        const next = allowPrefix ? hostnameFor(prefix, created.domain) : created.domain;
        lastEmittedValue.current = next;
        onSelect(next);
      },
    });
  };

  const selected = useMemo(
    () => domains
      .filter((item) => value === item.domain || value?.endsWith(`.${item.domain}`))
      .sort((a, b) => b.domain.length - a.domain.length)[0] ?? null,
    [domains, value],
  );
  const selectedConnected = selected ? isConnected(selected) : false;

  useEffect(() => {
    if (!allowPrefix) return;
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null;
      return;
    }
    if (!value || !selected) {
      setPrefix("");
      return;
    }
    setPrefix(value === selected.domain ? "" : value.slice(0, -(selected.domain.length + 1)));
  }, [allowPrefix, selected, value]);

  const selectDomain = (item: DomainSettingsView) => {
    const next = allowPrefix ? hostnameFor(prefix, item.domain) : item.domain;
    lastEmittedValue.current = next;
    onSelect(next);
    setOpen(false);
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3.5 ${compact ? "h-11" : "py-3"}`}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{w.loadingDomains}</span>
      </div>
    );
  }

  const dropdown = open && (
    <div className={`${dropdownInline ? "relative" : "absolute inset-x-0 z-50"} max-h-64 overflow-auto rounded-xl border border-border bg-popover shadow-lg ${dropdownInline ? "mt-1.5" : dropUp ? "bottom-full mb-1.5" : "mt-1.5"}`}>
      {domains.map((item) => {
        const connected = isConnected(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => selectDomain(item)}
            className={`flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors hover:bg-muted/40 ${selected?.id === item.id ? "bg-muted/30" : ""}`}
          >
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${connected ? "bg-success-bg" : "bg-muted"}`}>
              <Globe className={`size-4 ${connected ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.domain}</p>
              <p className="text-xs text-muted-foreground">{connected ? w.connected : w.needsAttention}</p>
            </div>
            {selected?.id === item.id && <CheckCircle2 className="size-4 shrink-0 text-success" />}
          </button>
        );
      })}
      <div className="border-t border-border/50">
        <button
          type="button"
          onClick={openAddDomain}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors hover:bg-muted/40"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Plus className="size-4 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">{w.addNewDomain}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={dropdownRef}
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {allowPrefix ? (
        <>
          <div className={`flex w-full items-center overflow-hidden rounded-xl border border-border/50 bg-background transition-colors focus-within:border-primary/40 ${compact ? "h-11" : "h-12"}`}>
            <input
              value={prefix}
              onChange={(event) => {
                const nextPrefix = normalizePrefixInput(event.target.value);
                setPrefix(nextPrefix);
                if (selected) {
                  const next = hostnameFor(nextPrefix, selected.domain);
                  lastEmittedValue.current = next;
                  onSelect(next);
                }
              }}
              placeholder={w.prefixPlaceholder}
              aria-label={w.prefixPlaceholder}
              disabled={disabled || !selected}
              className="min-w-16 flex-1 bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
            />
            {selected && prefix && <span className="text-sm text-muted-foreground">.</span>}
            <button
              type="button"
              onClick={() => !disabled && setOpen((current) => !current)}
              disabled={disabled}
              className="flex h-full min-w-0 max-w-[65%] shrink-0 items-center gap-2 px-3.5 text-sm text-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed"
            >
              <span className="truncate">
                {selected?.domain ?? (value || (loadFailed ? w.loadFailed : domains.length === 0 ? w.noDomains : w.selectDomain))}
              </span>
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
          {!compact && value && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {selected ? (selectedConnected ? w.connected : w.needsAttention) : w.notInDomainList}
            </p>
          )}
          {dropdown}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => !disabled && setOpen((current) => !current)}
            disabled={disabled}
            className={`flex w-full items-center gap-3 rounded-xl border border-border/50 bg-background text-start transition-colors hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-11 px-3.5" : "px-3.5 py-3"}`}
          >
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${selectedConnected ? "bg-success-bg" : "bg-muted"}`}>
              <Globe className={`size-4 ${selectedConnected ? "text-success" : "text-muted-foreground"}`} />
            </div>
            {value ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{value}</p>
                {!compact && (
                  <p className="text-xs text-muted-foreground">
                    {selected ? (selectedConnected ? w.connected : w.needsAttention) : w.notInDomainList}
                  </p>
                )}
              </div>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {loadFailed ? w.loadFailed : domains.length === 0 ? w.noDomains : w.selectDomain}
              </span>
            )}
            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {dropdown}
        </>
      )}
    </div>
  );
}
