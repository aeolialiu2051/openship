"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { domainSettingsApi, getApiErrorMessage, type DomainSettingsView } from "@/lib/api";
import { PageContainer } from "@/components/ui/PageContainer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/context/ToastContext";
import { useI18n, interpolate } from "@/components/i18n-provider";

export default function DomainsPage() {
  const { t } = useI18n();
  const m = t.domainsPage;
  const { showToast } = useToast();
  const [settings, setSettings] = useState<DomainSettingsView | null>(null);
  const [domain, setDomain] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [proxied, setProxied] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const applySettings = useCallback((next: DomainSettingsView | null) => {
    setSettings(next);
    setDomain(next?.domain ?? "");
    setZoneId(next?.cloudflareZoneId ?? "");
    setProxied(next?.cloudflareProxy ?? true);
    setApiToken("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void domainSettingsApi
      .get()
      .then((value) => {
        if (!cancelled) applySettings(value);
      })
      .catch((error) => {
        if (!cancelled) showToast(getApiErrorMessage(error, m.loadFailed), "error", m.title);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applySettings, m.loadFailed, m.title, showToast]);

  const canSave = useMemo(
    () =>
      !!domain.trim() &&
      !!zoneId.trim() &&
      (!!apiToken.trim() || settings?.cloudflareApiTokenConfigured === true),
    [apiToken, domain, settings, zoneId],
  );

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const next = await domainSettingsApi.save({
        domain: domain.trim().toLowerCase(),
        cloudflareZoneId: zoneId.trim(),
        ...(apiToken.trim() ? { cloudflareApiToken: apiToken.trim() } : {}),
        cloudflareProxy: proxied,
      });
      applySettings(next);
      showToast(m.saved, "success", m.title);
    } catch (error) {
      showToast(getApiErrorMessage(error, m.saveFailed), "error", m.title);
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    if (!settings || verifying) return;
    setVerifying(true);
    try {
      const result = await domainSettingsApi.verify();
      setSettings((current) =>
        current
          ? { ...current, verifiedAt: result.verifiedAt, lastVerificationError: null }
          : current,
      );
      showToast(m.verified, "success", m.title);
    } catch (error) {
      const message = getApiErrorMessage(error, m.verifyFailed);
      setSettings((current) =>
        current ? { ...current, verifiedAt: null, lastVerificationError: message } : current,
      );
      showToast(message, "error", m.title);
    } finally {
      setVerifying(false);
    }
  };

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await domainSettingsApi.remove();
      applySettings(null);
      setConfirmDisconnect(false);
      showToast(m.removed, "success", m.title);
    } catch (error) {
      showToast(getApiErrorMessage(error, m.removeFailed), "error", m.title);
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = !!settings?.verifiedAt && !settings.lastVerificationError;
  const statusLabel = connected ? m.connected : settings ? m.needsAttention : m.notConnected;

  return (
    <PageContainer>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-foreground/80">{m.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground/70">{m.subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
            connected
              ? "bg-success-bg text-success"
              : settings
                ? "bg-warning-bg text-warning"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? <CheckCircle2 className="size-3.5" /> : <Cloud className="size-3.5" />}
          {statusLabel}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            <div className="flex items-start gap-4 border-b border-border/50 px-6 py-5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Globe2 className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">{m.zoneTitle}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{m.zoneDescription}</p>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <Field label={m.domainLabel} hint={m.domainHint}>
                <Input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value.toLowerCase())}
                  placeholder={m.domainPlaceholder}
                  autoComplete="off"
                />
              </Field>

              <Field label={m.zoneIdLabel} hint={m.zoneIdHint}>
                <Input
                  value={zoneId}
                  onChange={(event) => setZoneId(event.target.value.trim())}
                  placeholder={m.zoneIdPlaceholder}
                  autoComplete="off"
                  className="font-mono text-[13px]"
                />
              </Field>

              <Field label={m.tokenLabel} hint={m.tokenHint}>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder={
                      settings?.cloudflareApiTokenConfigured
                        ? m.tokenPlaceholderSaved
                        : m.tokenPlaceholderNew
                    }
                    autoComplete="new-password"
                    className="pe-11 font-mono text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((value) => !value)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showToken ? "Hide token" : "Show token"}
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-between gap-5 rounded-xl border border-border/50 bg-background/40 px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.proxyLabel}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {m.proxyDescription}
                  </p>
                </div>
                <Switch checked={proxied} onChange={setProxied} ariaLabel={m.proxyLabel} />
              </div>

              {settings?.lastVerificationError && (
                <div className="rounded-xl border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger">
                  {settings.lastVerificationError}
                </div>
              )}
              {settings?.verifiedAt && !settings.lastVerificationError && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" />
                  {interpolate(m.lastVerified, {
                    date: new Date(settings.verifiedAt).toLocaleString(),
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-5">
                <div>
                  {settings && (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(true)}
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
                    >
                      <Trash2 className="size-4" />
                      {m.disconnect}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {settings && (
                    <button
                      type="button"
                      onClick={() => void verify()}
                      disabled={verifying || saving}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {verifying ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      {verifying ? m.verifying : m.verify}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!canSave || saving || verifying}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    {saving ? m.saving : m.save}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Network className="size-4" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">{m.workflowTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {m.workflowDescription}
              </p>
              <div className="mt-5 space-y-4">
                <WorkflowStep
                  number="1"
                  title={m.stepOneTitle}
                  description={m.stepOneDescription}
                />
                <WorkflowStep
                  number="2"
                  title={m.stepTwoTitle}
                  description={m.stepTwoDescription}
                />
                <WorkflowStep
                  number="3"
                  title={m.stepThreeTitle}
                  description={m.stepThreeDescription}
                />
              </div>
              {domain.trim() && (
                <div className="mt-5 rounded-xl bg-muted/50 px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {interpolate(m.example, { domain: domain.trim() })}
                </div>
              )}
            </div>

            <InfoCard
              icon={LockKeyhole}
              title={m.securityTitle}
              description={m.securityDescription}
            />
            <InfoCard icon={KeyRound} title={m.sslTitle} description={m.sslDescription} />
          </aside>
        </div>
      )}

      <Modal
        isOpen={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        maxWidth="440px"
        closable={!disconnecting}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-foreground">{m.disconnectTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{m.disconnectDescription}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              disabled={disconnecting}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {m.cancel}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="inline-flex items-center gap-2 rounded-xl bg-danger-solid px-4 py-2.5 text-sm font-medium text-white hover:bg-danger-solid/90 disabled:opacity-50"
            >
              {disconnecting && <Loader2 className="size-4 animate-spin" />}
              {m.confirmDisconnect}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
      <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{hint}</span>
    </label>
  );
}

function WorkflowStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {number}
      </div>
      <div>
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
