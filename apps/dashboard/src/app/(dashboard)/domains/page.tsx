"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  Network,
  Plus,
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
  const [domains, setDomains] = useState<DomainSettingsView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<DomainSettingsView | null | undefined>(undefined);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DomainSettingsView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDomains = useCallback(async () => {
    try {
      setLoading(true);
      setDomains(await domainSettingsApi.list());
    } catch (error) {
      showToast(getApiErrorMessage(error, m.loadFailed), "error", m.title);
    } finally {
      setLoading(false);
    }
  }, [m.loadFailed, m.title, showToast]);

  useEffect(() => {
    void fetchDomains();
  }, [fetchDomains]);

  const verify = async (item: DomainSettingsView) => {
    if (verifyingId) return;
    setVerifyingId(item.id);
    try {
      const result = await domainSettingsApi.verify(item.id);
      setDomains((current) =>
        current.map((domain) =>
          domain.id === item.id
            ? { ...domain, verifiedAt: result.verifiedAt, lastVerificationError: null }
            : domain,
        ),
      );
      showToast(m.verified, "success", item.domain);
    } catch (error) {
      const message = getApiErrorMessage(error, m.verifyFailed);
      setDomains((current) =>
        current.map((domain) =>
          domain.id === item.id
            ? { ...domain, verifiedAt: null, lastVerificationError: message }
            : domain,
        ),
      );
      showToast(message, "error", item.domain);
    } finally {
      setVerifyingId(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await domainSettingsApi.remove(deleteTarget.id);
      setDomains((current) => current.filter((domain) => domain.id !== deleteTarget.id));
      setDeleteTarget(null);
      setEditor(undefined);
      showToast(m.removed, "success", m.title);
    } catch (error) {
      showToast(getApiErrorMessage(error, m.removeFailed), "error", m.title);
    } finally {
      setDeleting(false);
    }
  };

  const verifiedCount = domains.filter(isConnected).length;
  const attentionCount = domains.length - verifiedCount;
  const proxyCount = domains.filter((domain) => domain.cloudflareProxy).length;
  const verifiedPct = domains.length ? Math.round((verifiedCount / domains.length) * 100) : 0;

  return (
    <PageContainer>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-foreground/80">{m.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground/70">{m.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditor(null)}
          className="inline-flex min-w-fit items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
        >
          <Plus className="size-4" />
          {m.addDomain}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : domains.length === 0 ? (
        <EmptyState onAdd={() => setEditor(null)} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card divide-y divide-border/50">
              {domains.map((item) => {
                const connected = isConnected(item);
                return (
                  <div
                    key={item.id}
                    className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
                  >
                    <button
                      type="button"
                      onClick={() => setEditor(item)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-start"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 transition-colors group-hover:bg-muted">
                        <Globe2 className="size-[18px] text-foreground/70" />
                      </div>
                      <div className="min-w-0 flex-1 sm:w-48 sm:flex-none lg:w-56">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.domain}
                        </p>
                      </div>
                      <div className="hidden min-w-0 flex-1 items-center gap-3 overflow-hidden sm:flex">
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                          <Cloud className="size-3.5" />
                          {item.cloudflareProxy ? m.proxyOn : m.proxyOff}
                        </span>
                        <span className="hidden truncate text-xs text-muted-foreground md:block">
                          {item.verifiedAt
                            ? interpolate(m.lastVerified, {
                                date: new Date(item.verifiedAt).toLocaleDateString(),
                              })
                            : m.notConnected}
                        </span>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${
                          connected ? "text-success" : "text-warning"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            connected ? "bg-success-solid" : "bg-warning-solid"
                          }`}
                        />
                        <span className="hidden sm:inline">
                          {connected ? m.connected : m.needsAttention}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground rtl:rotate-180" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void verify(item)}
                      disabled={verifyingId !== null}
                      title={m.verify}
                      className="hidden size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 lg:inline-flex"
                    >
                      {verifyingId === item.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-border/50 bg-card">
              <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted">
                  <Activity className="size-[18px] text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">{m.overviewTitle}</h2>
                  <p className="text-xs text-muted-foreground">{m.overviewSubtitle}</p>
                </div>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tabular-nums text-foreground">
                        {verifiedCount}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {domains.length} {m.connected}
                      </span>
                    </div>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {verifiedPct}%
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success-solid transition-[width] duration-500"
                      style={{ width: `${verifiedPct}%` }}
                    />
                  </div>
                  {attentionCount > 0 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning">
                      <span className="size-1.5 rounded-full bg-warning-solid" />
                      {attentionCount} {m.needsAttention}
                    </p>
                  )}
                </div>
                <div className="space-y-0.5 border-t border-border/50 pt-4">
                  <Stat icon={Globe2} label={m.totalDomains} value={domains.length} />
                  <Stat icon={CheckCircle2} label={m.verifiedDomains} value={verifiedCount} />
                  <Stat icon={Cloud} label={m.proxyEnabled} value={proxyCount} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Network className="size-4" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">{m.workflowTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {m.workflowDescription}
              </p>
            </div>
          </aside>
        </div>
      )}

      <DomainEditor
        value={editor}
        onClose={() => setEditor(undefined)}
        onSaved={(saved) => {
          setDomains((current) => {
            const exists = current.some((item) => item.id === saved.id);
            return exists
              ? current.map((item) => (item.id === saved.id ? saved : item))
              : [saved, ...current];
          });
          setEditor(undefined);
        }}
        onDelete={(item) => setDeleteTarget(item)}
      />

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        maxWidth="440px"
        closable={!deleting}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-foreground">{m.disconnectTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{m.disconnectDescription}</p>
          {deleteTarget && (
            <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 font-mono text-sm text-foreground">
              {deleteTarget.domain}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {m.cancel}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-xl bg-danger-solid px-4 py-2.5 text-sm font-medium text-white hover:bg-danger-solid/90 disabled:opacity-50"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {m.confirmDisconnect}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

function DomainEditor({
  value,
  onClose,
  onSaved,
  onDelete,
}: {
  value: DomainSettingsView | null | undefined;
  onClose: () => void;
  onSaved: (value: DomainSettingsView) => void;
  onDelete: (value: DomainSettingsView) => void;
}) {
  const { t } = useI18n();
  const m = t.domainsPage;
  const title = value ? m.editTitle : m.addTitle;
  const description = value ? m.editDescription : m.addDescription;
  const { showToast } = useToast();
  const [domain, setDomain] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [proxied, setProxied] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (value === undefined) return;
    setDomain(value?.domain ?? "");
    setZoneId(value?.cloudflareZoneId ?? "");
    setApiToken("");
    setProxied(value?.cloudflareProxy ?? true);
    setShowToken(false);
    setTesting(false);
  }, [value]);

  const canSave =
    !!domain.trim() &&
    !!zoneId.trim() &&
    (!!apiToken.trim() || value?.cloudflareApiTokenConfigured === true);

  const currentInput = () => ({
    domain: domain.trim().toLowerCase(),
    cloudflareZoneId: zoneId.trim(),
    ...(apiToken.trim() ? { cloudflareApiToken: apiToken.trim() } : {}),
    cloudflareProxy: proxied,
  });

  const testConnection = async () => {
    if (!canSave || saving || testing) return;
    setTesting(true);
    try {
      await domainSettingsApi.test({
        ...currentInput(),
        ...(value ? { id: value.id } : {}),
      });
      showToast(m.verified, "success", domain.trim().toLowerCase());
    } catch (error) {
      showToast(getApiErrorMessage(error, m.verifyFailed), "error", m.title);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!canSave || saving || testing) return;
    setSaving(true);
    try {
      const input = currentInput();
      const saved = value
        ? await domainSettingsApi.update(value.id, input)
        : await domainSettingsApi.create(input);
      onSaved(saved);
      showToast(m.saved, "success", saved.domain);
    } catch (error) {
      showToast(getApiErrorMessage(error, m.saveFailed), "error", m.title);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={value !== undefined}
      onClose={onClose}
      width="720px"
      maxWidth="92vw"
      maxHeight="90vh"
      closable={!saving && !testing}
    >
      <div className="border-b border-border/50 px-6 py-5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
            onChange={(event) => setZoneId(event.target.value)}
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
              placeholder={value ? m.tokenPlaceholderSaved : m.tokenPlaceholderNew}
              autoComplete="new-password"
              className="pe-11 font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShowToken((current) => !current)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showToken ? m.hideToken : m.showToken}
            >
              {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between gap-5 rounded-xl border border-border/50 bg-background/40 px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">{m.proxyLabel}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{m.proxyDescription}</p>
          </div>
          <Switch checked={proxied} onChange={setProxied} ariaLabel={m.proxyLabel} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/50 px-6 py-4">
        <div>
          {value && (
            <button
              type="button"
              onClick={() => onDelete(value)}
              disabled={saving || testing}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {m.disconnect}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || testing}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {m.cancel}
          </button>
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={!canSave || saving || testing}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {testing ? m.verifying : m.verify}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving || testing}
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
    </Modal>
  );
}

function isConnected(item: DomainSettingsView) {
  return !!item.verifiedAt && !item.lastVerificationError;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="inline-flex items-center gap-2.5 text-sm text-muted-foreground">
        <Icon className="size-4 text-muted-foreground/60" />
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const m = t.domainsPage;
  return (
    <div className="py-16 text-center">
      <div className="mx-auto mb-7 flex size-24 items-center justify-center rounded-3xl border border-border/50 bg-card">
        <Globe2 className="size-10 text-muted-foreground/50" />
      </div>
      <h2 className="text-2xl font-medium text-foreground/80">{m.emptyTitle}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground/70">
        {m.emptyDescription}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
      >
        <Plus className="size-4" />
        {m.addFirstDomain}
      </button>
      <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: Cloud, title: m.stepOneTitle, body: m.stepOneDescription },
          { icon: KeyRound, title: m.securityTitle, body: m.securityDescription },
          { icon: Network, title: m.stepThreeTitle, body: m.stepThreeDescription },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border/50 bg-card p-4 text-start">
            <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </div>
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
