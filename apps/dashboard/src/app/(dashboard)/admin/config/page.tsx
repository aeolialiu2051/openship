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
  kind: "boolean" | "number" | "pinning" | "secret" | "price" | "optionalPrice";
}> = [
  {
    key: "STRIPE_SECRET_KEY",
    group: "commercial",
    title: ["Stripe 密钥", "Stripe secret key"],
    description: [
      "用于创建 Stripe 客户、结账会话和订阅。保存后会加密存储。",
      "Used to create Stripe customers, checkout sessions, and subscriptions. Encrypted at rest.",
    ],
    kind: "secret",
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    group: "commercial",
    title: ["Stripe Webhook 密钥", "Stripe webhook secret"],
    description: [
      "用于验证 Stripe Webhook 签名。保存后会加密存储。",
      "Used to verify Stripe webhook signatures. Encrypted at rest.",
    ],
    kind: "secret",
  },
  {
    key: "STRIPE_PRICE_PRO_MONTHLY",
    group: "commercial",
    title: ["Pro 月付价格", "Pro monthly price"],
    description: ["美元金额，例如 5。", "Price in USD, for example 5."],
    kind: "price",
  },
  {
    key: "STRIPE_PRICE_PRO_ANNUAL",
    group: "commercial",
    title: ["Pro 年付价格", "Pro annual price"],
    description: ["美元金额，例如 50。", "Price in USD, for example 50."],
    kind: "price",
  },
  {
    key: "STRIPE_PRICE_PRO_PROMOTIONAL",
    group: "commercial",
    title: ["Pro 限时活动价格", "Pro promotional price"],
    description: [
      "可选的月付美元活动价。留空时不显示活动标签和原价删除线。",
      "Optional promotional monthly price in USD. Leave blank to hide the offer label and crossed-out price.",
    ],
    kind: "optionalPrice",
  },
  {
    key: "STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL",
    group: "commercial",
    title: ["Pro 年付限时活动价格", "Pro annual promotional price"],
    description: [
      "可选的年付美元活动价。留空时年付选项不显示活动标签和原价删除线。",
      "Optional annual promotional price in USD. Leave blank to hide the offer label and crossed-out annual price.",
    ],
    kind: "optionalPrice",
  },
  {
    key: "CLOUD_MAX_PROJECTS_PER_USER",
    group: "commercial",
    title: ["Free 用户项目上限", "Free projects per user"],
    description: [
      "对 Cloud 和 self-hosted 项目的创建或确保操作即时生效；Pro 用户不受限制。",
      "Applies immediately to Cloud and self-hosted project creation; Pro users are unlimited.",
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
            ? "这些配置会在保存后立即用于新请求。清除覆盖值后会重新继承部署环境中的默认值。BILLING_ENABLED 和 BILLING_TOPUPS_ENABLED 仅通过环境变量配置。"
            : "These settings apply to new requests immediately. Clear an override to inherit the deployment environment again. BILLING_ENABLED and BILLING_TOPUPS_ENABLED are environment-only."}
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
            ? "Stripe 密钥会加密保存且只以掩码显示；留空或保持掩码不会覆盖现有密钥。数据库、Redis、端口、域名和认证启动参数仍由部署环境管理。"
            : "Stripe secrets are encrypted and only shown as masks; blank or masked values do not replace an existing secret. Databases, Redis, ports, domains, and auth bootstrap settings remain deployment-managed."}
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
                  className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center"
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
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3">
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
                      {item.kind === "secret" && (
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={values[item.key] as string}
                          placeholder={zh ? "输入密钥" : "Enter secret"}
                          aria-label={item.title[zh ? 0 : 1]}
                          onChange={(event) => setValue(item.key, event.target.value)}
                          className="h-10 w-full rounded-xl border border-border/60 bg-background/70 px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                        />
                      )}
                      {item.kind === "price" && (
                        <div className="relative w-full">
                          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={values[item.key] as number}
                            aria-label={item.title[zh ? 0 : 1]}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isFinite(next) && next > 0) setValue(item.key, next);
                            }}
                            className="h-10 w-full rounded-xl border border-border/60 bg-background/70 ps-7 pe-3 text-sm font-medium tabular-nums text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      )}
                      {item.kind === "optionalPrice" && (
                        <div className="relative w-full">
                          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={(values[item.key] as number) > 0 ? (values[item.key] as number) : ""}
                            placeholder={zh ? "留空则关闭" : "Blank disables offer"}
                            aria-label={item.title[zh ? 0 : 1]}
                            onChange={(event) => {
                              if (event.target.value === "") {
                                setValue(item.key, 0);
                                return;
                              }
                              const next = Number(event.target.value);
                              if (Number.isFinite(next) && next > 0) setValue(item.key, next);
                            }}
                            className="h-10 w-full rounded-xl border border-border/60 bg-background/70 ps-7 pe-3 text-sm font-medium tabular-nums text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                          />
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
