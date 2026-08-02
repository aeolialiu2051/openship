"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { buildAuthPageHref, CLI_LOGIN_FLOW, getCloudDesktopHandoffUrl } from "@/lib/cloud-auth";
import { tokensApi } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { Loader2, Monitor, Check, CheckCircle2 } from "lucide-react";

/**
 * OAuth-style authorize page - shown after login (or immediately if
 * already logged in) when a desktop app requests access.
 *
 * Flow:
 *   - Desktop opens /authorize?callback=...&app=...&machine=...
 *   - If not logged in → redirect to /login (preserving params)
 *   - If logged in → show authorize UI with explicit button
 *   - Authorize → handoff endpoint → redirect back to desktop API
 */
export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </AuthShell>
      }
    >
      <AuthorizePageInner />
    </Suspense>
  );
}

function AuthorizePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { t } = useI18n();

  const callback = searchParams.get("callback");
  const appName = searchParams.get("app") || "Vibrail Desktop";
  const machine = searchParams.get("machine");
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const isCliLogin = searchParams.get("flow") === CLI_LOGIN_FLOW;
  const [submitting, setSubmitting] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build handoff URL with state + PKCE challenge
  const handoffUrl =
    !isCliLogin && callback
      ? getCloudDesktopHandoffUrl({
          callbackUrl: callback,
          state,
          codeChallenge,
        })
      : null;

  // Preserve the desktop-cloud flow marker so login/register/OAuth
  // return to /authorize instead of falling back to the normal app flow.
  const loginUrl = buildAuthPageHref("/login", searchParams);

  // Not logged in → redirect to login
  useEffect(() => {
    if (!isPending && !session) {
      router.replace(loginUrl);
    }
  }, [isPending, session, loginUrl, router]);

  // No callback → invalid request
  if ((!callback && !isCliLogin) || (isCliLogin && (!state || !codeChallenge))) {
    return (
      <AuthShell>
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t.misc.authorize.invalidRequest}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.misc.authorize.missingParams}</p>
        </div>
      </AuthShell>
    );
  }

  // Loading or not authenticated yet
  if (isPending || !session) {
    return (
      <AuthShell>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  if (authorized) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/80 to-emerald-600 shadow-sm">
            <CheckCircle2 className="size-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold">{t.misc.authorize.successTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.misc.authorize.successBody}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/80 to-primary shadow-sm">
          <Monitor className="size-7 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-semibold">
          {interpolate(t.misc.authorize.title, { app: appName })}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {machine
            ? interpolate(t.misc.authorize.wantsToConnectOnMachine, { app: appName, machine })
            : interpolate(t.misc.authorize.wantsToConnect, { app: appName })}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">{t.misc.authorize.signedInAs}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{session.user.email}</p>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{t.misc.authorize.willAllow}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="size-3.5 text-success shrink-0" />
              {t.misc.authorize.permDeploy}
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-3.5 text-success shrink-0" />
              {t.misc.authorize.permAccess}
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <Button
          className="w-full"
          size="lg"
          disabled={submitting}
          onClick={async () => {
            if (isCliLogin) {
              setSubmitting(true);
              setError(null);
              try {
                await tokensApi.cliAuthorize({
                  state: state!,
                  codeChallenge: codeChallenge!,
                  name: machine ? `Vibrail CLI on ${machine}` : "Vibrail CLI",
                });
                setAuthorized(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Authorization failed");
                setSubmitting(false);
              }
              return;
            }
            if (handoffUrl) window.location.href = handoffUrl;
          }}
        >
          {submitting && <Loader2 className="me-2 size-4 animate-spin" />}
          {t.misc.authorize.authorize}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => window.close()}>
          {t.misc.authorize.cancel}
        </Button>
      </div>
    </AuthShell>
  );
}
