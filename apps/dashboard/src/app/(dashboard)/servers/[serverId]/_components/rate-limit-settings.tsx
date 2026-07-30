"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Shield } from "lucide-react";
import { systemApi, type ServerRateLimitConfig } from "@/lib/api/system";
import { getApiErrorMessage } from "@/lib/api/client";
import { useToast } from "@/context/ToastContext";
import { useI18n, interpolate } from "@/components/i18n-provider";

function automaticBurst(rps: number): number {
  return rps <= 0 ? 0 : Math.max(1, Math.round(rps * 0.4));
}

export function RateLimitSettings({ serverId }: { serverId: string }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ServerRateLimitConfig | null>(null);
  const [rps, setRps] = useState(50);
  const [burst, setBurst] = useState(20);
  const [automatic, setAutomatic] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const syncDraft = useCallback((config: ServerRateLimitConfig) => {
    setCurrent(config);
    setRps(config.rps);
    setBurst(config.burst);
    setAutomatic(config.burst === automaticBurst(config.rps));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await systemApi.getRateLimit(serverId);
      syncDraft(response.config);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, t.servers.security.failedReadConfig));
    } finally {
      setLoading(false);
    }
  }, [serverId, syncDraft, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveBurst = automatic ? automaticBurst(rps) : burst;
  const changed = useMemo(
    () => current !== null && (current.rps !== rps || current.burst !== effectiveBurst),
    [current, effectiveBurst, rps],
  );
  const enabled = (current?.rps ?? 0) > 0;

  const save = async (next: ServerRateLimitConfig) => {
    setSaving(true);
    try {
      const previous = current
        ? interpolate(t.servers.security.policyBase, {
            rps: String(current.rps),
            burst: String(current.burst),
          })
        : "";
      const response = await systemApi.updateRateLimit(serverId, next);
      syncDraft(response.config);
      const updated = interpolate(t.servers.security.policyBase, {
        rps: String(response.config.rps),
        burst: String(response.config.burst),
      });
      showToast(
        next.rps > 0
          ? interpolate(t.servers.security.toastRateLimitUpdated, { from: previous, to: updated })
          : t.servers.security.toastRemoved,
        "success",
        t.servers.toastTitles.security,
      );
    } catch (error) {
      showToast(
        getApiErrorMessage(error, t.servers.security.toastFailedSave),
        "error",
        t.servers.toastTitles.security,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/10">
            <Shield className="size-[18px] text-orange-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {t.servers.security.title}
            </h2>
            <p className="text-xs text-muted-foreground">{t.servers.security.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          {t.servers.security.refresh}
        </button>
      </div>

      <div className="space-y-5 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t.servers.security.loading}
          </div>
        ) : loadError || !current ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-warning-border bg-warning-bg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t.servers.security.couldntRead}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-muted px-3 py-2 text-xs font-medium"
            >
              {t.servers.security.retry}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-xs leading-5 text-muted-foreground">
                {t.servers.security.redeployHint}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">
                {t.servers.security.requestsPerSecond}
              </label>
              <input
                type="number"
                min={0}
                max={1000000}
                value={rps}
                onChange={(event) =>
                  setRps(Math.max(0, Number.parseInt(event.target.value, 10) || 0))
                }
                className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {rps > 0 ? t.servers.security.serverWideHint : t.servers.security.noLimitHint}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAdvanced ? t.servers.security.hideAdvanced : t.servers.security.showAdvanced}
            </button>

            {showAdvanced && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-muted/15 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {t.servers.security.burstMode}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.servers.security.burstModeHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAutomatic((value) => !value);
                      if (!automatic) setBurst(automaticBurst(rps));
                    }}
                    className="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground"
                  >
                    {automatic
                      ? t.servers.security.switchToManual
                      : t.servers.security.useAutomaticBurst}
                  </button>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground">
                    {t.servers.security.burstAllowance}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={effectiveBurst}
                    disabled={automatic}
                    onChange={(event) =>
                      setBurst(Math.max(0, Number.parseInt(event.target.value, 10) || 0))
                    }
                    className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-5">
              <p className="text-xs text-muted-foreground">
                {enabled
                  ? interpolate(t.servers.security.policyBase, {
                      rps: String(current.rps),
                      burst: String(current.burst),
                    })
                  : t.servers.security.noLimitHint}
              </p>
              <div className="flex items-center gap-2">
                {enabled && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save({ rps: 0, burst: 0 })}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {t.servers.security.removeRateLimit}
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving || !changed}
                  onClick={() => void save({ rps, burst: rps > 0 ? effectiveBurst : 0 })}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  {enabled ? t.servers.security.saveChanges : t.servers.security.applyRateLimit}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
