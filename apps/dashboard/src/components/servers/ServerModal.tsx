"use client";

import { useCallback, useState } from "react";
import { ServerForm } from "@/app/(dashboard)/servers/_components/server-form";
import { useModal } from "@/context/ModalContext";
import { usePlatform } from "@/context/PlatformContext";
import type { ServerInfo } from "@/lib/api/system";
import { ServerSetupFlow } from "./ServerSetupFlow";

interface ServerModalOptions {
  server?: ServerInfo | null;
  onSaved?: (server: ServerInfo) => void;
}

function ServerModalContent({
  initialServer,
  selfHosted,
  userServers,
  onSaved,
  onDone,
}: {
  initialServer?: ServerInfo | null;
  selfHosted: boolean;
  userServers: boolean;
  onSaved?: (server: ServerInfo) => void;
  onDone: () => void;
}) {
  const [createdServer, setCreatedServer] = useState<ServerInfo | null>(null);

  if (createdServer) {
    return <ServerSetupFlow server={createdServer} onDone={onDone} />;
  }

  return (
    <ServerForm
      key={initialServer?.id ?? "new"}
      server={initialServer}
      selfHosted={selfHosted}
      userServers={userServers}
      onSaved={({ server, isEditing }) => {
        onSaved?.(server);
        if (isEditing) {
          onDone();
          return;
        }
        setCreatedServer(server);
      }}
    />
  );
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
          <ServerModalContent
            initialServer={options.server}
            selfHosted={selfHosted}
            userServers={userServers}
            onSaved={options.onSaved}
            onDone={() => hideModal(modalId)}
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
