"use client";

import { GitHubProvider } from "@/context/GitHubContext";
import { CloudProvider } from "@/context/CloudContext";
import { PlatformProvider } from "@/context/PlatformContext";
import { AuthProvider, type AuthUser } from "@/context/AuthContext";
import { ProjectDeletionProvider } from "@/context/ProjectDeletionContext";
import { PageViewTracker } from "@/components/page-view-tracker";

interface DashboardProvidersProps {
  children: React.ReactNode;
  selfHosted: boolean;
  userServers: boolean;
  deployMode: string;
  isServerHost?: boolean;
  authMode: "cloud" | "local" | "none";
  version?: string;
  cloudAuthUrl: string;
  cloudApiUrl: string;
  discordLink?: string | null;
  machineName?: string;
  siteDomain: string;
  managedDomain: string;
  managedDomainNeedsCloud: boolean;
  initialUser?: AuthUser | null;
  initialGithubData?: any;
}

export function DashboardProviders({
  children,
  initialGithubData,
  initialUser,
  selfHosted,
  userServers,
  deployMode,
  isServerHost,
  authMode,
  version,
  cloudAuthUrl,
  cloudApiUrl,
  discordLink,
  machineName,
  siteDomain,
  managedDomain,
  managedDomainNeedsCloud,
}: DashboardProvidersProps) {
  return (
    <AuthProvider initialUser={initialUser}>
      <PlatformProvider
        selfHosted={selfHosted}
        userServers={userServers}
        deployMode={deployMode}
        isServerHost={isServerHost}
        authMode={authMode}
        version={version}
        cloudAuthUrl={cloudAuthUrl}
        cloudApiUrl={cloudApiUrl}
        discordLink={discordLink}
        machineName={machineName}
        siteDomain={siteDomain}
        managedDomain={managedDomain}
        managedDomainNeedsCloud={managedDomainNeedsCloud}
      >
        <GitHubProvider initialData={initialGithubData}>
          <CloudProvider>
            <ProjectDeletionProvider>
              <PageViewTracker />
              {children}
            </ProjectDeletionProvider>
          </CloudProvider>
        </GitHubProvider>
      </PlatformProvider>
    </AuthProvider>
  );
}
