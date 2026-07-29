"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Cloud,
  Database,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Waves,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { DismissiblePopover } from "@/components/ui/Popover";
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
  const { locale, t } = useI18n();
  const m = t.domainsPage;
  const providerCopy =
    locale === "zh"
      ? {
          label: "域名服务商",
          hint: "选择托管域名 DNS 的服务商。更多服务商正在接入中。",
          comingSoon: "即将推出",
          cloudflareDescription: "免费 DNS、全球网络与自动代理。",
          route53Description: "Amazon Web Services 托管 DNS。",
          digitalOceanDescription: "DigitalOcean 管理的 DNS 区域。",
          namecheapDescription: "Namecheap 默认 DNS 服务。",
          googleDescription: "Google Cloud 管理的 DNS 区域。",
        }
      : {
          label: "Domain provider",
          hint: "Choose the provider that hosts this domain's DNS. More integrations are on the way.",
          comingSoon: "Coming soon",
          cloudflareDescription: "Free DNS, global network and automatic proxying.",
          route53Description: "Managed DNS from Amazon Web Services.",
          digitalOceanDescription: "DNS zones managed by DigitalOcean.",
          namecheapDescription: "Namecheap's default DNS service.",
          googleDescription: "DNS zones managed by Google Cloud.",
        };
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
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {value ? m.editTitle : m.addTitle}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {value ? m.editDescription : m.addDescription}
          </p>
        </div>
      </div>
      <div className="space-y-5 px-6 py-6">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">{providerCopy.label}</p>
          <ProviderSelect copy={providerCopy} />
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{providerCopy.hint}</p>
        </div>
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
    </>
  );
}

type ProviderCopy = {
  comingSoon: string;
  cloudflareDescription: string;
  route53Description: string;
  digitalOceanDescription: string;
  namecheapDescription: string;
  googleDescription: string;
};

function ProviderSelect({ copy }: { copy: ProviderCopy }) {
  const [open, setOpen] = useState(false);
  const providers = [
    {
      id: "cloudflare",
      name: "Cloudflare",
      description: copy.cloudflareDescription,
      available: true,
      icon: <Cloud className="size-5 text-[#f48120]" />,
    },
    {
      id: "route53",
      name: "AWS Route 53",
      description: copy.route53Description,
      available: false,
      icon: <Database className="size-5 text-[#ff9900]" />,
    },
    {
      id: "digitalocean",
      name: "DigitalOcean",
      description: copy.digitalOceanDescription,
      available: false,
      icon: <Waves className="size-5 text-[#0080ff]" />,
    },
    {
      id: "namecheap",
      name: "Namecheap",
      description: copy.namecheapDescription,
      available: false,
      icon: <Server className="size-5 text-[#f0441d]" />,
    },
    {
      id: "google",
      name: "Google Cloud DNS",
      description: copy.googleDescription,
      available: false,
      icon: <Globe2 className="size-5 text-[#4285f4]" />,
    },
  ];

  return (
    <DismissiblePopover open={open} onOpenChange={setOpen} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${
          open
            ? "border-primary/40 bg-primary/[0.04] ring-2 ring-primary/10"
            : "border-border bg-background hover:bg-muted/40"
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <ProviderMark>
            <Cloud className="size-5 text-[#f48120]" />
          </ProviderMark>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Cloudflare</span>
            <span className="block truncate text-xs text-muted-foreground">
              {copy.cloudflareDescription}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute start-0 top-full z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border/60 bg-popover/95 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl"
        >
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              role="option"
              aria-selected={provider.available}
              disabled={!provider.available}
              onClick={() => setOpen(false)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors ${
                provider.available
                  ? "bg-foreground/[0.055] hover:bg-foreground/[0.08]"
                  : "cursor-not-allowed opacity-65"
              }`}
            >
              <ProviderMark>{provider.icon}</ProviderMark>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {provider.name}
                  </span>
                  {!provider.available && (
                    <span className="shrink-0 rounded-full border border-border/70 bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {copy.comingSoon}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {provider.description}
                </span>
              </span>
              {provider.available && <Check className="size-4 shrink-0 text-success" />}
            </button>
          ))}
        </div>
      )}
    </DismissiblePopover>
  );
}

function ProviderMark({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-card shadow-sm">
      {children}
    </span>
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
