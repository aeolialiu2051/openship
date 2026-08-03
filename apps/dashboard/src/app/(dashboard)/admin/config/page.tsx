"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import {
  adminApi,
  getApiErrorMessage,
  type AdminRuntimeConfig,
  type AdminRuntimeConfigState,
} from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Switch } from "@/components/ui/Switch";
import { AdminError, AdminLoading } from "../_components/admin-ui";

type ConfigKey = keyof AdminRuntimeConfig;

const ITEMS: Array<{
  key: ConfigKey;
  group: "commercial" | "security" | "network";
  title: [string, string];
  description: [string, string];
  kind: "boolean" | "number" | "pinning";
}> = [
  {
    key: "BILLING_ENABLED",
    group: "commercial",
    title: ["启用订阅计费", "Enable subscription billing"],
    description: [
      "立即开放 Stripe 订阅入口；Stripe 密钥和价格仍由部署环境提供。",
      "Open Stripe subscription flows immediately; Stripe credentials and prices remain deployment-level secrets.",
    ],
    kind: "boolean",
  },
  {
    key: "BILLING_TOPUPS_ENABLED",
    group: "commercial",
    title: ["启用额度充值", "Enable credit top-ups"],
    description: [
      "开放一次性额度包购买；只有订阅计费同时开启时才生效。",
      "Allow one-time credit pack purchases; effective only while subscription billing is enabled.",
    ],
    kind: "boolean",
  },
  {
    key: "CLOUD_MAX_PROJECTS_PER_USER",
    group: "commercial",
    title: ["每位云用户的项目上限", "Cloud projects per user"],
    description: [
      "创建或确保项目时即时应用的新上限，不影响已有项目。",
      "Apply the new cap to project creation immediately without removing existing projects.",
    ],
    kind: "number",
  },
  {
    key: "CLOUD_SESSION_PINNING",
    group: "security",
    title: ["云会话指纹策略", "Cloud session fingerprinting"],
    description: [
      "控制 IP 或浏览器指纹变化时是忽略、记录告警还是拒绝请求。",
      "Choose whether IP or browser fingerprint changes are ignored, logged, or rejected.",
    ],
    kind: "pinning",
  },
  {
    key: "NOTIFY_WEBHOOK_ALLOW_INTERNAL",
    group: "security",
    title: ["允许通知 Webhook 访问私网", "Allow private-network notification webhooks"],
    description: [
      "仅自托管生效。开启后可通知局域网服务，但会放宽 SSRF 防护。",
      "Self-hosted only. Enables LAN webhook targets and intentionally relaxes SSRF protection.",
    ],
    kind: "boolean",
  },
  {
    key: "VIBRAIL_CLOUDFLARE_PROXY",
    group: "network",
    title: ["Cloudflare 默认代理", "Cloudflare proxy by default"],
    description: [
      "新建或更新 Vibrail 托管 DNS 记录时切换橙云代理状态。",
      "Control the proxied flag when Vibrail-managed DNS records are created or updated.",
    ],
    kind: "boolean",
  },
];

export default function AdminRuntimeConfigPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [state, setState] = useState<AdminRuntimeConfigState | null>(null);
  const [values, setValues] = useState<AdminRuntimeConfig | null>(null);
  const [inherited, setInherited] = useState<Set<ConfigKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await adminApi.runtimeConfig();
      setState(next);
      setValues(next.values);
      setInherited(
        new Set(ITEMS.map((item) => item.key).filter((key) => !(key in next.overrides))),
      );
    } catch (err) {
      setError(
        getApiErrorMessage(err, zh ? "运行配置加载失败" : "Failed to load runtime configuration"),
      );
    } finally {
      setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!state || !values) return false;
    return ITEMS.some(({ key }) => {
      const wasInherited = !(key in state.overrides);
      if (wasInherited !== inherited.has(key)) return true;
      return !inherited.has(key) && state.overrides[key] !== values[key];
    });
  }, [inherited, state, values]);

  function setValue(key: ConfigKey, value: AdminRuntimeConfig[ConfigKey]) {
    setValues((current) =>
      current ? ({ ...current, [key]: value } as AdminRuntimeConfig) : current,
    );
    setInherited((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setSaved(false);
  }

  function useEnvironmentDefault(key: ConfigKey) {
    if (!state) return;
    setValues((current) =>
      current ? { ...current, [key]: state.environmentDefaults[key] } : current,
    );
    setInherited((current) => new Set(current).add(key));
    setSaved(false);
  }

  async function save() {
    if (!values) return;
    setSaving(true);
    setError(null);
    try {
      const patch = Object.fromEntries(
        ITEMS.map(({ key }) => [key, inherited.has(key) ? null : values[key]]),
      ) as Partial<{ [K in ConfigKey]: AdminRuntimeConfig[K] | null }>;
      const next = await adminApi.updateRuntimeConfig(patch);
      setState(next);
      setValues(next.values);
      setInherited(
        new Set(ITEMS.map((item) => item.key).filter((key) => !(key in next.overrides))),
      );
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, zh ? "保存失败" : "Failed to save configuration"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AdminLoading />;
  if (error && !values) return <AdminError message={error} />;
  if (!state || !values) return null;

  const groups = [
    { id: "commercial", title: zh ? "商业策略" : "Commercial policy" },
    { id: "security", title: zh ? "安全策略" : "Security policy" },
    { id: "network", title: zh ? "网络策略" : "Network policy" },
  ] as const;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {zh ? "运行配置" : "Runtime configuration"}
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {zh
              ? "这些策略会在保存后立即用于新请求和后台任务。清除覆盖值后会重新继承部署环境中的默认值。"
              : "These policies apply to new requests and background jobs immediately. Clear an override to inherit the deployment environment again."}
          </p>
        </div>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saved ? (
            <Check className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          {saved ? (zh ? "已保存" : "Saved") : zh ? "保存配置" : "Save changes"}
        </button>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          {zh
            ? "密钥、数据库、Redis、端口、域名和认证启动参数不会出现在这里；修改它们仍需通过安全的部署环境并重启服务。"
            : "Secrets, databases, Redis, ports, domains, and authentication bootstrap values stay deployment-managed and still require a service restart."}
        </p>
      </div>

      {error && <AdminError message={error} />}

      {groups.map((group) => (
        <section
          key={group.id}
          className="overflow-hidden rounded-2xl border border-border/50 bg-card"
        >
          <div className="border-b border-border/50 bg-muted/15 px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
          </div>
          <div className="divide-y divide-border/50">
            {ITEMS.filter((item) => item.group === group.id).map((item) => {
              const isInherited = inherited.has(item.key);
              return (
                <div
                  key={item.key}
                  className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_280px] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-medium text-foreground">
                        {item.title[zh ? 0 : 1]}
                      </h4>
                      <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {item.key}
                      </code>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isInherited ? "bg-foreground/[0.06] text-muted-foreground" : "bg-primary/10 text-primary"}`}
                      >
                        {isInherited
                          ? zh
                            ? "继承环境"
                            : "Environment"
                          : zh
                            ? "管理员覆盖"
                            : "Admin override"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {item.description[zh ? 0 : 1]}
                    </p>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 lg:grid-cols-[148px_88px]">
                    <div className="flex min-w-0 justify-end">
                      {item.kind === "boolean" && (
                        <Switch
                          checked={values[item.key] as boolean}
                          onChange={(value) => setValue(item.key, value)}
                          ariaLabel={item.title[zh ? 0 : 1]}
                        />
                      )}
                      {item.kind === "number" && (
                        <div className="grid h-10 w-full grid-cols-[36px_1fr_36px] overflow-hidden rounded-xl border border-border/60 bg-background/70 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
                          <button
                            type="button"
                            disabled={values.CLOUD_MAX_PROJECTS_PER_USER <= 1}
                            aria-label={zh ? "减少项目上限" : "Decrease project limit"}
                            onClick={() =>
                              setValue(
                                "CLOUD_MAX_PROJECTS_PER_USER",
                                Math.max(1, values.CLOUD_MAX_PROJECTS_PER_USER - 1),
                              )
                            }
                            className="inline-flex items-center justify-center border-e border-border/50 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Minus className="size-3.5" strokeWidth={2} />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={values.CLOUD_MAX_PROJECTS_PER_USER}
                            aria-label={item.title[zh ? 0 : 1]}
                            onChange={(event) => {
                              const next = event.target.value.replace(/\D/g, "");
                              if (!next) return;
                              setValue(
                                "CLOUD_MAX_PROJECTS_PER_USER",
                                Math.max(1, Math.min(10000, Number(next))),
                              );
                            }}
                            className="min-w-0 bg-transparent px-2 text-center text-sm font-medium tabular-nums text-foreground outline-none"
                          />
                          <button
                            type="button"
                            disabled={values.CLOUD_MAX_PROJECTS_PER_USER >= 10000}
                            aria-label={zh ? "增加项目上限" : "Increase project limit"}
                            onClick={() =>
                              setValue(
                                "CLOUD_MAX_PROJECTS_PER_USER",
                                Math.min(10000, values.CLOUD_MAX_PROJECTS_PER_USER + 1),
                              )
                            }
                            className="inline-flex items-center justify-center border-s border-border/50 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Plus className="size-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      )}
                      {item.kind === "pinning" && (
                        <div className="relative w-full">
                          <select
                            value={values.CLOUD_SESSION_PINNING}
                            aria-label={item.title[zh ? 0 : 1]}
                            onChange={(event) =>
                              setValue(
                                "CLOUD_SESSION_PINNING",
                                event.target.value as AdminRuntimeConfig["CLOUD_SESSION_PINNING"],
                              )
                            }
                            className="h-10 w-full appearance-none rounded-xl border border-border/60 bg-background/70 ps-3 pe-9 text-sm font-medium text-foreground outline-none transition-colors hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                          >
                            <option value="off">{zh ? "关闭" : "Off"}</option>
                            <option value="warn">{zh ? "仅告警" : "Warn"}</option>
                            <option value="strict">{zh ? "严格拒绝" : "Strict"}</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isInherited}
                      onClick={() => useEnvironmentDefault(item.key)}
                      title={zh ? "恢复为部署环境值" : "Restore deployment environment value"}
                      className="inline-flex h-9 w-[88px] items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 disabled:cursor-default disabled:opacity-35"
                    >
                      <RotateCcw className="size-3.5" /> {zh ? "继承" : "Inherit"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
