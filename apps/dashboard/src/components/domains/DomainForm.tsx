"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/context/ToastContext";
import { domainSettingsApi, getApiErrorMessage, type DomainSettingsView } from "@/lib/api";

interface DomainFormProps {
  domain?: DomainSettingsView | null;
  onCancel: () => void;
  onSaved: (domain: DomainSettingsView) => void;
  onDelete?: (domain: DomainSettingsView) => void;
}

/** Shared domain create/edit form used by both the Domains page and inline
 * selectors. Keeping the API calls here prevents the two entry points from
 * drifting apart. */
export function DomainForm({ domain: value, onCancel, onSaved, onDelete }: DomainFormProps) {
  const { t } = useI18n();
  const m = t.domainsPage;
  const { showToast } = useToast();
  const [domain, setDomain] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [proxied, setProxied] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
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
    <>
      <div className="border-b border-border/50 px-6 py-5">
        <h2 className="text-lg font-semibold text-foreground">
          {value ? m.editTitle : m.addTitle}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {value ? m.editDescription : m.addDescription}
        </p>
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
          {value && onDelete && (
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
            onClick={onCancel}
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
            {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {testing ? m.verifying : m.verify}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving || testing}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {saving ? m.saving : m.save}
          </button>
        </div>
      </div>
    </>
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
