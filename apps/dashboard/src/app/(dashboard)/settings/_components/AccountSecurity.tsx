"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { changePassword, listAccounts, setPassword } from "@/lib/auth-client";
import { useToast } from "@/context/ToastContext";
import { useI18n } from "@/components/i18n-provider";
import { SettingsSection } from "./SettingsSection";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  disabled: boolean;
  showLabel: string;
  hideLabel: string;
  onChange: (value: string) => void;
};

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  disabled,
  showLabel,
  hideLabel,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2 pr-10 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          aria-label={visible ? hideLabel : showLabel}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AccountSecurity() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const copy = t.settings.account.password;
  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void listAccounts()
      .then(({ data }) => {
        if (active) {
          setHasPassword(data?.some((account) => account.providerId === "credential") ?? false);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (newPassword.length < 8 || newPassword.length > 128) {
      showToast(copy.toast.invalidLength, "error", copy.toast.title);
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(copy.toast.mismatch, "error", copy.toast.title);
      return;
    }
    if (hasPassword && !currentPassword) {
      showToast(copy.toast.currentRequired, "error", copy.toast.title);
      return;
    }

    setSubmitting(true);
    try {
      const result = hasPassword
        ? await changePassword({ currentPassword, newPassword, revokeOtherSessions })
        : await setPassword({ newPassword });
      if (result.error) {
        const message =
          result.error.code === "INVALID_PASSWORD"
            ? copy.toast.invalidCurrent
            : (result.error.message ?? copy.toast.failed);
        showToast(message, "error", copy.toast.title);
        return;
      }

      showToast(hasPassword ? copy.toast.changed : copy.toast.created, "success", copy.toast.title);
      setHasPassword(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      showToast(copy.toast.failed, "error", copy.toast.title);
    } finally {
      setSubmitting(false);
    }
  };

  const commonFieldProps = {
    disabled: submitting,
    showLabel: copy.showPassword,
    hideLabel: copy.hidePassword,
  };

  return (
    <SettingsSection
      icon={LockKeyhole}
      title={copy.title}
      description={hasPassword ? copy.changeDescription : copy.setDescription}
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {copy.loading}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
          {!hasPassword && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm text-muted-foreground">
              {copy.oauthHint}
            </div>
          )}

          {hasPassword && (
            <PasswordField
              {...commonFieldProps}
              id="current-password"
              label={copy.currentPassword}
              value={currentPassword}
              autoComplete="current-password"
              onChange={setCurrentPassword}
            />
          )}

          <PasswordField
            {...commonFieldProps}
            id="new-password"
            label={copy.newPassword}
            value={newPassword}
            autoComplete="new-password"
            onChange={setNewPassword}
          />
          <p className="text-xs text-muted-foreground">{copy.passwordHint}</p>

          <PasswordField
            {...commonFieldProps}
            id="confirm-password"
            label={copy.confirmPassword}
            value={confirmPassword}
            autoComplete="new-password"
            onChange={setConfirmPassword}
          />

          {hasPassword && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-muted/10 p-3">
              <input
                type="checkbox"
                checked={revokeOtherSessions}
                disabled={submitting}
                onChange={(event) => setRevokeOtherSessions(event.target.checked)}
                className="mt-0.5 size-4 rounded border-border accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {copy.revokeSessions}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {copy.revokeSessionsDescription}
                </span>
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? copy.saving : hasPassword ? copy.changeAction : copy.setAction}
          </button>
        </form>
      )}
    </SettingsSection>
  );
}
