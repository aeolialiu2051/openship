"use client";

import { useCallback } from "react";
import { ServerForm } from "@/app/(dashboard)/servers/_components/server-form";
import { useModal } from "@/context/ModalContext";
import { usePlatform } from "@/context/PlatformContext";
import type { ServerInfo } from "@/lib/api/system";

interface ServerModalOptions {
  server?: ServerInfo | null;
  onSaved?: (server: ServerInfo) => void;
}

/** One shared modal for both server creation and editing. ServerForm owns the
 * field state, validation and POST/PATCH behavior so the two flows cannot drift. */
export function useServerModal() {
  const { showModal, hideModal } = useModal();
  const { selfHosted, userServers } = usePlatform();

  return useCallback(
    (options: ServerModalOptions = {}) => {
      let modalId = "";
      modalId = showModal({
        width: "720px",
        maxWidth: "92vw",
        maxHeight: "90vh",
        overflow: "auto",
        customContent: (
          <ServerForm
            key={options.server?.id ?? "new"}
            server={options.server}
            selfHosted={selfHosted}
            userServers={userServers}
            onSaved={({ server }) => {
              hideModal(modalId);
              options.onSaved?.(server);
            }}
          />
        ),
      });
      return modalId;
    },
    [hideModal, selfHosted, showModal, userServers],
  );
}

/** Backward-compatible create-only facade used by server selectors and deploy flows. */
export function useAddServerModal() {
  const showServerModal = useServerModal();

  return useCallback(
    (options?: { onCreated?: (server: ServerInfo) => void }) =>
      showServerModal({ onSaved: options?.onCreated }),
    [showServerModal],
  );
}
