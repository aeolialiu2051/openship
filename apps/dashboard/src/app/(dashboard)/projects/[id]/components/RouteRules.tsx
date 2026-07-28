"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Info, Loader2, Plus, Shield, Trash2 } from "lucide-react";
import { projectsApi, getApiErrorMessage, type RouteRuleRow } from "@/lib/api";
import type { RouteRuleSpec } from "@repo/core";
import { useProjectSettings } from "@/context/ProjectSettingsContext";
import { useToast } from "@/context/ToastContext";
import { useI18n } from "@/components/i18n-provider";

function tokens(value: string): string[] {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function summarize(spec: RouteRuleSpec): string {
  const parts: string[] = [];
  if (spec.rateLimit) parts.push(`${spec.rateLimit.rps}/s +${spec.rateLimit.burst}`);
  const ranges = spec.ipAllowList?.sourceRange ?? spec.access?.allowCidrs;
  if (ranges?.length) parts.push(`IP × ${ranges.length}`);
  if (spec.inFlightReq) parts.push(`↔ ${spec.inFlightReq.amount}`);
  return parts.join(" · ") || "—";
}

export function RouteRules() {
  const { projectData, domainsData } = useProjectSettings();
  const { showToast } = useToast();
  const { t } = useI18n();
  const w = t.projectSettings.routeRules;

  const [rules, setRules] = useState<RouteRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);

  const [domainId, setDomainId] = useState("");
  const [pathPrefix, setPathPrefix] = useState("");
  const [rps, setRps] = useState("");
  const [burst, setBurst] = useState("");
  const [allowCidrs, setAllowCidrs] = useState("");
  const [maxInFlight, setMaxInFlight] = useState("");

  const domains = domainsData?.domains ?? [];
  const hostnameById = new Map(domains.map((domain) => [domain.id, domain.hostname]));

  const load = useCallback(async () => {
    if (!projectData?.id) return;
    setLoading(true);
    try {
      const response = await projectsApi.listRouteRules(projectData.id);
      const list = response?.rules ?? [];
      setRules(list);
      if (!autoOpened.current && list.length > 0) {
        setOpen(true);
        autoOpened.current = true;
      }
    } catch (error) {
      showToast(getApiErrorMessage(error, w.loadFailed), "error", w.title);
    } finally {
      setLoading(false);
    }
  }, [projectData?.id, showToast, w.loadFailed, w.title]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildSpec = (): RouteRuleSpec => {
    const spec: RouteRuleSpec = {};
    const rpsValue = Number(rps);
    if (Number.isFinite(rpsValue) && rpsValue > 0) {
      const burstValue = Number(burst);
      spec.rateLimit = {
        rps: Math.floor(rpsValue),
        burst: Number.isFinite(burstValue) && burstValue >= 0 ? Math.floor(burstValue) : 0,
      };
    }
    const sourceRange = tokens(allowCidrs);
    if (sourceRange.length > 0) spec.ipAllowList = { sourceRange };
    const inFlightValue = Number(maxInFlight);
    if (Number.isFinite(inFlightValue) && inFlightValue > 0) {
      spec.inFlightReq = { amount: Math.floor(inFlightValue) };
    }
    return spec;
  };

  const canAdd =
    Number(rps) > 0 || tokens(allowCidrs).length > 0 || Number(maxInFlight) > 0;

  const resetForm = () => {
    setDomainId("");
    setPathPrefix("");
    setRps("");
    setBurst("");
    setAllowCidrs("");
    setMaxInFlight("");
  };

  const handleAdd = async () => {
    if (!projectData?.id || saving || !canAdd) return;
    setSaving(true);
    try {
      await projectsApi.createRouteRule(projectData.id, {
        domainId: domainId || null,
        pathPrefix: pathPrefix.trim() || null,
        spec: buildSpec(),
        enabled: true,
      });
      resetForm();
      await load();
      showToast(w.saved, "success", w.title);
    } catch (error) {
      showToast(getApiErrorMessage(error, w.saveFailed), "error", w.title);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: RouteRuleRow) => {
    setBusyId(rule.id);
    try {
      await projectsApi.updateRouteRule(projectData.id, rule.id, { enabled: !rule.enabled });
      await load();
      showToast(w.saved, "success", w.title);
    } catch (error) {
      showToast(getApiErrorMessage(error, w.saveFailed), "error", w.title);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (rule: RouteRuleRow) => {
    setBusyId(rule.id);
    try {
      await projectsApi.deleteRouteRule(projectData.id, rule.id);
      await load();
      showToast(w.saved, "success", w.title);
    } catch (error) {
      showToast(getApiErrorMessage(error, w.saveFailed), "error", w.title);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start transition-colors hover:bg-muted/20"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <Shield className="size-[18px]" />
          </div>
          <div className="text-start">
            <h3 className="text-[14px] font-semibold text-foreground">{w.title}</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{w.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rules.length > 0 && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {rules.length}
            </span>
          )}
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/40 px-5 py-4">
          <div className="flex gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{w.deploymentNotice}</span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {w.loading}
            </div>
          ) : rules.length === 0 ? (
            <p className="py-1 text-[13px] text-muted-foreground">{w.empty}</p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {rule.pathPrefix || w.allPaths}
                      <span className="ms-2 text-[12px] font-normal text-muted-foreground">
                        {rule.domainId ? hostnameById.get(rule.domainId) || w.allHosts : w.allHosts}
                      </span>
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">{summarize(rule.spec)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle(rule)}
                    disabled={busyId === rule.id}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 ${rule.enabled ? "bg-success-bg text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {rule.enabled ? w.enabled : w.disabled}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rule)}
                    disabled={busyId === rule.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
                  >
                    {busyId === rule.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    {w.remove}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-border/60 p-4">
            <p className="mb-3 text-[13px] font-medium text-foreground">{w.addTitle}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={w.hostLabel}>
                <select value={domainId} onChange={(event) => setDomainId(event.target.value)} className={inputCls}>
                  <option value="">{w.allHosts}</option>
                  {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.hostname}</option>)}
                </select>
              </Field>
              <Field label={w.pathLabel}>
                <input value={pathPrefix} onChange={(event) => setPathPrefix(event.target.value)} placeholder="/api" className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={w.rps}>
                  <input value={rps} onChange={(event) => setRps(event.target.value)} inputMode="numeric" placeholder="10" className={inputCls} />
                </Field>
                <Field label={w.burst}>
                  <input value={burst} onChange={(event) => setBurst(event.target.value)} inputMode="numeric" placeholder="20" className={inputCls} />
                </Field>
              </div>
              <Field label={w.maxInFlight}>
                <input value={maxInFlight} onChange={(event) => setMaxInFlight(event.target.value)} inputMode="numeric" placeholder="100" className={inputCls} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={w.allowCidrs}>
                  <input value={allowCidrs} onChange={(event) => setAllowCidrs(event.target.value)} placeholder="203.0.113.10, 10.0.0.0/8" className={inputCls} />
                </Field>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !canAdd}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {w.add}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-border/50 bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
