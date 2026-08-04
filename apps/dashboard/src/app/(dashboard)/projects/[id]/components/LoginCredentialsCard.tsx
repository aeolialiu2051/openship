"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound } from "lucide-react";
import { projectsApi } from "@/lib/api/projects";
import { useI18n } from "@/components/i18n-provider";

interface LoginCredentials {
  url: string;
  username: string;
  password: string;
}

/** Optional human-login card for ordinary source projects; Catalog apps use template outputs. */
export function LoginCredentialsCard({ projectId }: { projectId: string }) {
  const [resolvedLogin, setResolvedLogin] = useState<{
    projectId: string;
    login: LoginCredentials | null;
  } | null>(null);
  const { t } = useI18n();
  const labels = t.projects.loginCredentials;

  useEffect(() => {
    let cancelled = false;
    projectsApi
      .getLogin(projectId)
      .then((result) => {
        if (!cancelled) setResolvedLogin({ projectId, login: result.data });
      })
      .catch(() => {
        // Read-only project members and projects without a card see nothing.
        if (!cancelled) setResolvedLogin({ projectId, login: null });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Stay hidden until this project's request has confirmed that login details
  // exist. Matching the project ID also prevents stale details flashing while
  // navigating between projects.
  const login = resolvedLogin?.projectId === projectId ? resolvedLogin.login : null;
  if (!login) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{labels.title}</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{labels.description}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CredentialRow
          label={labels.homepage}
          value={login.url}
          copyLabel={labels.copy}
          action={
            <a
              href={login.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={labels.open}
              title={labels.open}
            >
              <ExternalLink className="size-3.5" />
            </a>
          }
        />
        <CredentialRow label={labels.username} value={login.username} copyLabel={labels.copy} />
        <div className="md:col-span-2">
          <CredentialRow
            label={labels.password}
            value={login.password}
            secret
            copyLabel={labels.copy}
            revealLabel={labels.reveal}
            hideLabel={labels.hide}
          />
        </div>
      </div>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  secret = false,
  copyLabel,
  revealLabel,
  hideLabel,
  action,
}: {
  label: string;
  value: string;
  secret?: boolean;
  copyLabel: string;
  revealLabel?: string;
  hideLabel?: string;
  action?: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const display = secret && !revealed ? "•".repeat(Math.min(value.length, 40)) : value;

  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1 rounded-xl border border-border/50 bg-background px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{display}</code>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={revealed ? hideLabel : revealLabel}
            title={revealed ? hideLabel : revealLabel}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
        {action}
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={copyLabel}
          title={copyLabel}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
