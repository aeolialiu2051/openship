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
  machineName?: string;
  hostDomain?: string;
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
  machineName,
  hostDomain,
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
        machineName={machineName}
        hostDomain={hostDomain}
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
