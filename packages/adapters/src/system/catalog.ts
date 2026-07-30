import type { EnvironmentProfile } from "./environment";

export interface ComponentCheckCatalogEntry {
  versionCommand: string;
  parseVersion: (output: string) => string;
  daemonCommand?: string;
  runningCommands?: string[];
  missingMessage: string;
  notRunningMessage?: string;
  permissionMessage?: string;
}

export interface InstallPlan {
  supported: boolean;
  unsupportedReason?: string;
  installCommand?: string;
  startCommand?: string;
  verifyCommand?: string;
  healthCommand?: string;
  healthError?: string;
  fallbackInstallCommands?: string[];
}

function packageInstallPlan(
  profile: EnvironmentProfile,
  name: string,
  verifyCommand: string,
): InstallPlan {
  const commands: Record<string, string> = {
    apt: `apt-get update -qq && apt-get install -y -qq ${name}`,
    dnf: `dnf install -y ${name}`,
    yum: `yum install -y ${name}`,
    apk: `apk add --no-cache ${name}`,
    brew: `brew install ${name}`,
  };
  const installCommand = commands[profile.packageManager];
  return installCommand
    ? { supported: true, installCommand, verifyCommand }
    : { supported: false, unsupportedReason: `No supported package manager found for ${name}` };
}

function dockerInstallPlan(profile: EnvironmentProfile): InstallPlan {
  if (profile.os !== "linux") {
    return { supported: false, unsupportedReason: "Docker installation is only supported on Linux servers" };
  }
  return {
    supported: true,
    installCommand: "curl -fsSL https://get.docker.com | sh",
    startCommand:
      profile.serviceManager === "systemd"
        ? "systemctl daemon-reload && systemctl enable --now docker"
        : undefined,
    verifyCommand: "docker --version",
    // systemctl may return before dockerd is ready to accept connections.
    // Give it a short bounded startup window before declaring installation bad.
    healthCommand:
      "attempt=0; until docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; do attempt=$((attempt + 1)); [ \"$attempt\" -ge 10 ] && exit 1; sleep 1; done",
    healthError: "Docker is installed but the daemon is not running",
  };
}

export const systemCatalog = {
  checks: {
    docker: {
      versionCommand: "docker --version",
      daemonCommand: "docker info --format '{{.ServerVersion}}'",
      parseVersion: (output: string) => output.match(/Docker version ([^\s,]+)/)?.[1] ?? output,
      missingMessage: "Docker is not installed",
      notRunningMessage: "Docker is installed but the daemon is not running",
      permissionMessage:
        "Docker is running, but the SSH user cannot access the Docker socket - reinstall Docker to grant access",
    },
    certbot: {
      versionCommand: "certbot --version 2>/dev/null",
      parseVersion: (output: string) => output.match(/certbot\s+(\S+)/)?.[1] ?? output,
      missingMessage: "Certbot is not installed",
    },
    git: {
      versionCommand: "git --version",
      parseVersion: (output: string) => output.match(/git version (\S+)/)?.[1] ?? output,
      missingMessage: "Git is not installed",
    },
    rsync: {
      versionCommand: "rsync --version | head -n 1",
      parseVersion: (output: string) => output.match(/rsync\s+version\s+(\S+)/i)?.[1] ?? output,
      missingMessage: "rsync is not installed",
    },
  },
  installs: {
    docker: dockerInstallPlan,
    git: (profile: EnvironmentProfile) => packageInstallPlan(profile, "git", "git --version"),
    rsync: (profile: EnvironmentProfile) =>
      packageInstallPlan(profile, "rsync", "rsync --version | head -n 1"),
    certbot: (profile: EnvironmentProfile) =>
      packageInstallPlan(profile, "certbot", "certbot --version 2>/dev/null"),
  },
};
