"use client";

// TODO: removed — temporary SaaS "Cloud is almost here" waitlist gate.
// Delete this file, the /api/cloud-waitlist route, and the gate in Sidebar's
// handleDeploy when Openship Cloud opens for real deploys.

import { useState } from "react";
import { Cloud, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cloudBrandCopy } from "@/lib/cloud-brand";

/**
 * SaaS-only "Openship Cloud is almost here" gate. Shown instead of running a
 * deploy while the managed cloud isn't open yet — captures an email for the
 * notify-me waitlist. "Notify me" POSTs to `/api/cloud-waitlist`, a thin Next
 * route handler that forwards to `process.env.MARKETING_API_URL` (no DB / Hono
 * changes; no-ops gracefully when the env isn't configured).
 */
export function CloudWaitlistModal({ onClose }: { onClose: () => void }) {
  const { locale } = useI18n();
  const copy = cloudBrandCopy(locale);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = async () => {
    if (!valid || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/cloud-waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || copy.waitlistGenericError);
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError(copy.waitlistNetworkError);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Cloud className="size-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{copy.waitlistTitle}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {copy.waitlistDescription}
          </p>
        </div>
      </div>

      {status === "done" ? (
        <div className="flex items-center gap-2.5 rounded-xl bg-success-bg px-4 py-3 text-sm text-success">
          <Check className="size-4 shrink-0" />
          {copy.waitlistDone}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {copy.waitlistLabel}
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              autoFocus
              disabled={status === "sending"}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="you@example.com"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!valid || status === "sending"}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "sending" && <Loader2 className="size-4 animate-spin" />}
              {copy.waitlistNotify}
            </button>
          </div>
          {status === "error" && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {status === "done" ? copy.done : copy.close}
        </button>
      </div>
    </div>
  );
}
