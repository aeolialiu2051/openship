"use client";

/**
 * Zero-auth → local-auth upgrade modal.
 *
 * The synthetic "Local User" provisioned for a zero-auth desktop install
 * keeps its userId across this upgrade — every FK (projects, deployments,
 * member rows, audit) stays valid. The backend rewrites the user row
 * (name/email/emailVerified), inserts a Better Auth credential account
 * with the hashed password, and flips instanceSettings.authMode to
 * "local" in one transaction. On success the response sets a fresh
 * session cookie so the browser stays signed in.
 *
 * System email is configured independently through Settings → Email or the
 * deployment's SMTP environment. User-hosted mail servers are tenant
 * resources and are never selected as authentication transports here.
 */

import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, X } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useI18n } from "@/components/i18n-provider";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UpgradeAuthModal({ open, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length < 8) {
      showToast(t.settings.upgradeAuth.toast.passwordTooShort, "error", t.settings.common.toast.authUpgrade);
      return;
    }
    setSubmitting(true);
    try {
      await api.post("system/upgrade-to-auth", {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      showToast(t.settings.upgradeAuth.toast.accountCreated, "success", t.settings.common.toast.authUpgrade);
      onSuccess();
    } catch (err) {
      showToast(getApiErrorMessage(err, t.settings.upgradeAuth.toast.failedUpgrade), "error", t.settings.common.toast.authUpgrade);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Lock className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{t.settings.upgradeAuth.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {t.settings.upgradeAuth.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0 disabled:opacity-50"
            title={t.settings.upgradeAuth.close}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground block">{t.settings.upgradeAuth.name}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              disabled={submitting}
              className="w-full px-3 py-2 bg-muted/30 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder={t.settings.upgradeAuth.namePlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground block">{t.settings.upgradeAuth.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={submitting}
              className="w-full px-3 py-2 bg-muted/30 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder={t.settings.upgradeAuth.emailPlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground block">{t.settings.upgradeAuth.password}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={submitting}
                className="w-full px-3 py-2 pe-10 bg-muted/30 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder={t.settings.upgradeAuth.passwordPlaceholder}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {t.settings.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !email.trim() || password.length < 8}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t.settings.upgradeAuth.createAccount}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
