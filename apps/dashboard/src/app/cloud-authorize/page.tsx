"use client";

/**
 * /cloud-authorize — explicit consent screen for the self-hosted
 * "Connect to Openship Cloud" flow.
 *
 * The API's GET /api/cloud/connect-handoff used to auto-mint a one-time
 * handoff code for any authenticated browser whose URL passed the
 * redirect/state/code_challenge validators. That made connect codes
 * effectively CSRF-exploitable bearer tokens — anyone who could trick
 * a logged-in browser into hitting connect-handoff with their own
 * redirect could swap themselves into the popup flow.
 *
 * Now connect-handoff 302s here. The page authenticates against the
 * cloud Better-Auth session (cookie), shows what's about to happen,
 * and only after an explicit "Authorize" click POSTs to the new
 * /api/cloud/connect-authorize endpoint. That endpoint requires the
 * cookie, re-validates everything, and only then mints the code.
 *
 * Why top-level and not under (auth):
 *   The (auth) layout actively redirects authenticated users away on
 *   render — it's gated for the "unauthenticated visitor reaches a
 *   login form" case. Our consent page is meant for an AUTHENTICATED
 *   visitor, so it has to live outside (auth). We still want the
 *   AuthShell visual treatment for visual parity with /login and
 *   /authorize, so we wrap manually.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ServerIcon, AlertCircle } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { cloudApi } from "@/lib/api";
import { ApiError, getApiErrorMessage } from "@/lib/api/client";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

/** RFC 7636 — code_challenge is 43-128 url-safe chars. We accept the
 *  same 40-128 window the API uses so any URL valid server-side renders. */
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{40,128}$/;
/** State is opaque to us; we just cap its length and keep it url-safe-ish. */
const STATE_RE = /^[A-Za-z0-9_\-.~]{1,256}$/;

type ValidatedParams =
  | { ok: true; redirect: string; redirectHost: string; state: string; codeChallenge: string }
  | { ok: false; error: string };

/**
 * Mirror of the server-side validators. We re-check on the client only
 * so a malformed URL renders a clear error instead of crashing the page
 * or leaking through to an authorize POST that the server will reject.
 * The server is authoritative on POST.
 */
function validateParams(searchParams: URLSearchParams): ValidatedParams {
  const redirect = searchParams.get("redirect");
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");

  if (!redirect) return { ok: false, error: "Missing redirect parameter." };
  if (!state) return { ok: false, error: "Missing state parameter." };
  if (!codeChallenge) return { ok: false, error: "Missing code_challenge parameter." };

  if (!STATE_RE.test(state)) return { ok: false, error: "Invalid state parameter." };
  if (!CODE_CHALLENGE_RE.test(codeChallenge)) {
    return { ok: false, error: "Invalid code_challenge parameter." };
  }

  let url: URL;
  try {
    url = new URL(redirect);
  } catch {
    return { ok: false, error: "Invalid redirect URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Redirect must use http or https." };
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocalhost && url.protocol !== "https:") {
    return { ok: false, error: "Non-localhost redirects must use HTTPS." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Redirect URL must not contain userinfo." };
  }

  return {
    ok: true,
    redirect: url.toString(),
    redirectHost: url.host,
    state,
    codeChallenge,
  };
}

/** Build the safe `?returnTo=` value to attach to /login. Encodes the
 *  full pathname+search so the post-login redirect lands back here with
 *  the same params. */
function buildReturnTo(searchParams: URLSearchParams): string {
  const qs = searchParams.toString();
  return qs ? `/cloud-authorize?${qs}` : "/cloud-authorize";
}

function CloudAuthorizeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const validated = useMemo(() => validateParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAuthorize = useCallback(async () => {
    if (!validated.ok) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { callbackUrl } = await cloudApi.connectAuthorize({
        redirect: validated.redirect,
        state: validated.state,
        codeChallenge: validated.codeChallenge,
      });
      // Hard navigate so the local instance receives the code via a
      // top-level GET — the local callback (cloud-connect-callback /
      // /api/auth/cloud-callback) needs to read the same-origin
      // localStorage PKCE verifier that was stashed before the popup
      // opened, so SPA routing won't work here.
      window.location.href = callbackUrl;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session expired between page load and click — bounce to login.
        router.replace(`/login?returnTo=${encodeURIComponent(buildReturnTo(new URLSearchParams(searchParams.toString())))}`);
        return;
      }
      setSubmitError(getApiErrorMessage(err, "Could not authorize this connection."));
      setSubmitting(false);
    }
  }, [validated, router, searchParams]);

  const handleCancel = useCallback(() => {
    if (typeof window !== "undefined" && window.opener) {
      try {
        window.close();
        return;
      } catch {
        /* user-gesture missing or blocked — fall through */
      }
    }
    router.push("/");
  }, [router]);

  // Auth-pending → spinner. Once we know there's no session, bounce
  // to /login with a returnTo. Doing this in an effect (not at render)
  // avoids the suspended-render-during-render issue with router.replace.
  useEffect(() => {
    if (!validated.ok) return;
    if (isPending) return;
    if (!session) {
      router.replace(
        `/login?returnTo=${encodeURIComponent(buildReturnTo(new URLSearchParams(searchParams.toString())))}`,
      );
    }
  }, [validated.ok, isPending, session, router, searchParams]);

  if (!validated.ok) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/80 to-red-600 shadow-sm">
            <AlertCircle className="size-7 text-white" />
          </div>
          <h1 className="text-lg font-semibold">Invalid authorization request</h1>
          <p className="mt-2 text-sm text-muted-foreground">{validated.error}</p>
        </div>
      </AuthShell>
    );
  }

  if (isPending || !session) {
    return (
      <AuthShell>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/80 to-primary shadow-sm">
          <ServerIcon className="size-7 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Authorize device</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          An Openship instance at{" "}
          <span className="font-medium text-foreground">{validated.redirectHost}</span>{" "}
          wants to connect to your Openship Cloud account.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Signed in as</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{session.user.email}</p>
      </div>

      {submitError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="space-y-2">
        <Button
          className="w-full"
          size="lg"
          disabled={submitting}
          onClick={() => {
            void handleAuthorize();
          }}
        >
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {submitting ? "Authorizing…" : "Authorize"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={submitting}
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>
    </AuthShell>
  );
}

export default function CloudAuthorizePage() {
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
      <CloudAuthorizeInner />
    </Suspense>
  );
}
