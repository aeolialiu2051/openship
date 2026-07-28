"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  MoreVertical,
  ExternalLink,
  Copy,
  RotateCcw,
  RefreshCw,
  XCircle,
  Trash2,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";
import { generateIcon } from "@/utils/icons";
import { getSiteUrl } from "@/utils/siteUrl";
import { deployApi, getApiErrorMessage } from "@/lib/api";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { useToast } from "@/context/ToastContext";
import { invalidateProjectsHomeCache } from "@/hooks/useProjectsHome";

const MENU_OFFSET = 8;
const MENU_WIDTH = 224;
const MENU_MAX_HEIGHT = 420;
const MENU_MIN_PREFERRED_HEIGHT = 240;
const VIEWPORT_PADDING = 12;

interface MenuPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  openAbove: boolean;
}

interface Deployment {
  id: string;
  status: string;
  domain: string;
  owner?: string;
  repo?: string;
  commit: {
    hash: string;
    /** Full SHA when known — required by "Redeploy this commit". */
    fullHash?: string | null;
  };
  /** Rollback state — flows from the orchestrator-aware listing endpoint. */
  artifactRetainedAt?: string | null;
  pinned?: boolean;
  isActive?: boolean;
  deletionOperationId?: string | null;
  deletionOperationStatus?: "queued" | "running" | "needs_action" | null;
}

interface DeploymentMenuProps {
  deployment: Deployment;
  triggerClassName?: string;
  onStatusChange?: () => void;
}

export const DeploymentMenu: React.FC<DeploymentMenuProps> = ({
  deployment,
  triggerClassName,
  onStatusChange,
}) => {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(
    deployment.deletionOperationStatus === "queued" ||
      deployment.deletionOperationStatus === "running",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;

    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_PADDING * 2));
    const isRtl = window.getComputedStyle(triggerRef.current).direction === "rtl";
    const alignedLeft = isRtl ? rect.left : rect.right - width;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, alignedLeft),
      Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING),
    );
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openAbove = spaceBelow < MENU_MIN_PREFERRED_HEIGHT && spaceAbove > spaceBelow;
    const availableHeight = Math.max(120, (openAbove ? spaceAbove : spaceBelow) - MENU_OFFSET);

    setMenuPosition({
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + MENU_OFFSET }
        : { top: rect.bottom + MENU_OFFSET }),
      left,
      width,
      maxHeight: Math.min(MENU_MAX_HEIGHT, availableHeight),
      openAbove,
    });
  }, []);

  useEffect(() => {
    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (!!containerRef.current?.contains(target) || !!menuRef.current?.contains(target));

    const handleClickOutside = (event: MouseEvent) => {
      if (!isInside(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    const handlePositionChange = () => updateMenuPosition();

    window.addEventListener("resize", handlePositionChange);
    window.addEventListener("scroll", handlePositionChange, true);

    return () => {
      window.removeEventListener("resize", handlePositionChange);
      window.removeEventListener("scroll", handlePositionChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    setIsDeleting(
      deployment.deletionOperationStatus === "queued" ||
        deployment.deletionOperationStatus === "running",
    );
  }, [deployment.deletionOperationId, deployment.deletionOperationStatus]);

  // `isInFlight` = status-wise busy (the cancel/delete affordances care
  // about this). Distinct from `deployment.isActive` which means
  // "currently the active version" — the chip / rollback gating cares
  // about that one.
  const isInFlight = ["pending", "queued", "building", "deploying"].includes(deployment.status);
  const canRollback =
    deployment.status === "ready" && !deployment.isActive && !!deployment.artifactRetainedAt;
  // Surfaced when rollback is unavailable because the artifact was pruned —
  // the user can still rebuild this exact commit from source. Requires a
  // commit SHA to be on file (manual deploys without one are excluded).
  const canRedeployCommit =
    !canRollback &&
    !deployment.isActive &&
    !isInFlight &&
    !!deployment.commit?.fullHash &&
    deployment.commit.fullHash !== "N/A";

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    try {
      await deployApi.cancel(deployment.id);
      onStatusChange?.();
    } catch {
      /* silent */
    }
  };

  const handleRollback = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (!canRollback) return;
    const ok = window.confirm(t.deployments.menu.confirmRollback);
    if (!ok) return;
    try {
      await deployApi.rollback(deployment.id);
      onStatusChange?.();
    } catch (err) {
      window.alert(getApiErrorMessage(err, t.deployments.menu.rollbackFailed));
    }
  };

  const handleRedeployCommit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (!canRedeployCommit) return;
    const shortHash = deployment.commit.hash;
    const ok = window.confirm(interpolate(t.deployments.menu.confirmRedeploy, { hash: shortHash }));
    if (!ok) return;
    try {
      await deployApi.redeploy(deployment.id, { useExistingCommit: true });
      onStatusChange?.();
    } catch (err) {
      window.alert(getApiErrorMessage(err, t.deployments.menu.redeployFailed));
    }
  };

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    try {
      await deployApi.pin(deployment.id, !deployment.pinned);
      onStatusChange?.();
    } catch (err) {
      window.alert(
        getApiErrorMessage(
          err,
          deployment.pinned ? t.deployments.menu.unpinFailed : t.deployments.menu.pinFailed,
        ),
      );
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (isDeleting) return;
    if (!window.confirm(t.deployments.menu.confirmDelete)) return;
    setIsDeleting(true);
    try {
      await deployApi.deleteDeployment(deployment.id);
      invalidateProjectsHomeCache();
      showToast(t.deployments.menu.deleteQueued, "success");
      onStatusChange?.();
    } catch (err) {
      setIsDeleting(false);
      showToast(
        getApiErrorMessage(err, t.deployments.menu.deleteFailed),
        "error",
        t.deployments.menu.deleteFailed,
      );
    }
  };

  const menu =
    isOpen && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            className={`fixed z-[70] overflow-y-auto rounded-xl border border-border/50 bg-popover py-2 shadow-lg animate-in fade-in duration-200 ${
              menuPosition.openAbove ? "slide-in-from-bottom-2" : "slide-in-from-top-2"
            }`}
            style={{
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: menuPosition.maxHeight,
              ...(menuPosition.top !== undefined
                ? { top: menuPosition.top }
                : { bottom: menuPosition.bottom }),
            }}
          >
            {deployment.domain && (
              <button
                onClick={() => {
                  window.open(getSiteUrl(deployment.domain), "_blank");
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <ExternalLink className="w-4 h-4" />
                {t.deployments.menu.openDeployment}
              </button>
            )}

            {deployment.owner && deployment.repo && (
              <button
                onClick={() => {
                  window.open(
                    `https://github.com/${deployment.owner}/${deployment.repo}`,
                    "_blank",
                  );
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3"
              >
                {generateIcon(
                  "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
                  16,
                  "currentColor",
                  {},
                  true,
                )}
                {t.deployments.menu.viewRepository}
              </button>
            )}

            <div className="h-px bg-border/50 my-2" />

            {deployment.domain && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getSiteUrl(deployment.domain));
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <Copy className="w-4 h-4" />
                {t.deployments.menu.copyDomainUrl}
              </button>
            )}

            <button
              onClick={() => {
                navigator.clipboard.writeText(deployment.id);
                setIsOpen(false);
              }}
              className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <Copy className="w-4 h-4" />
              {t.deployments.menu.copyBuildId}
            </button>

            {isInFlight && (
              <>
                <div className="h-px bg-border/50 my-2" />
                <button
                  onClick={handleCancel}
                  className="w-full px-4 py-2.5 text-start text-sm text-danger hover:bg-danger-bg transition-colors flex items-center gap-3"
                >
                  <XCircle className="w-4 h-4" />
                  {t.deployments.menu.cancelDeployment}
                </button>
              </>
            )}

            {/* Rollback path — instant restore from the preserved artifact.
                Enabled iff status=ready, not currently active, AND artifact
                is still retained (not pruned). */}
            {!isInFlight && deployment.status !== "building" && (
              <>
                <div className="h-px bg-border/50 my-2" />
                <button
                  onClick={handleRollback}
                  disabled={!canRollback}
                  title={
                    canRollback
                      ? t.deployments.menu.rollbackTitle.enabled
                      : deployment.isActive
                        ? t.deployments.menu.rollbackTitle.active
                        : !deployment.artifactRetainedAt
                          ? t.deployments.menu.rollbackTitle.pruned
                          : t.deployments.menu.rollbackTitle.notReady
                  }
                  className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t.deployments.menu.rollback}
                </button>

                {/* Fallback for when the artifact has been pruned out of the
                    rollback window: rebuild the same commit from source. Only
                    shown when rollback isn't available, so the two CTAs never
                    overlap. */}
                {canRedeployCommit && (
                  <button
                    onClick={handleRedeployCommit}
                    title={t.deployments.menu.redeployTitle}
                    className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t.deployments.menu.redeploy}
                  </button>
                )}
              </>
            )}

            {/* Pin / Unpin — toggles the artifact's exemption from
                retention prune. Available for any ready deployment. */}
            {!isInFlight && deployment.status === "ready" && (
              <button
                onClick={handleTogglePin}
                disabled={!deployment.pinned && !deployment.artifactRetainedAt}
                title={
                  deployment.pinned
                    ? t.deployments.menu.pinTitle.unpin
                    : !deployment.artifactRetainedAt
                      ? t.deployments.menu.pinTitle.pruned
                      : t.deployments.menu.pinTitle.pin
                }
                className="w-full px-4 py-2.5 text-start text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                {deployment.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {deployment.pinned ? t.deployments.menu.unpin : t.deployments.menu.pin}
              </button>
            )}

            {!isInFlight && (
              <>
                <div className="h-px bg-border/50 my-2" />
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full px-4 py-2.5 text-start text-sm text-danger hover:bg-danger-bg transition-colors flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isDeleting ? t.deployments.status.deleting : t.deployments.menu.deleteDeployment}
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={
          triggerClassName ||
          "w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        }
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menu}
    </div>
  );
};
