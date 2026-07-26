"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string;
};

type AuthState = {
  /** The authenticated user, or `null` when logged-out / loading. */
  user: AuthUser | null;
  /** Whether a session request is currently in flight. */
  isLoading: boolean;
  /** Shorthand: `!!user` - safe to use after `isLoading` is false. */
  isLoggedIn: boolean;
  /** Sign the user out and redirect to `/login`. */
  logout: () => Promise<void>;
};

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthState | undefined>(undefined);

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: AuthUser | null;
}) {
  const router = useRouter();
  // The dashboard server layout validates the session before this provider is
  // rendered and passes the canonical user. Calling Better Auth's useSession
  // here repeated the same request immediately after hydration and competed
  // with page-critical data. Session-changing flows already navigate/reload.
  const user = initialUser;
  const isLoading = false;
  const isLoggedIn = !!user;

  const logout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isLoggedIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

/**
 * Access the current authentication state from any client component.
 *
 * ```tsx
 * const { user, isLoggedIn, isLoading, logout } = useAuth();
 * ```
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
