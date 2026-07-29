"use client";

import { useCallback } from "react";
import { DomainForm } from "@/components/domains/DomainForm";
import { useModal } from "@/context/ModalContext";
import type { DomainSettingsView } from "@/lib/api";

interface DomainModalOptions {
  domain?: DomainSettingsView | null;
  onSaved?: (domain: DomainSettingsView) => void;
}

/** Shared modal entry point, matching the server selector's add-server flow. */
export function useDomainModal() {
  const { showModal, hideModal } = useModal();

  return useCallback(
    (options: DomainModalOptions = {}) => {
      let modalId = "";
      modalId = showModal({
        width: "720px",
        maxWidth: "92vw",
        maxHeight: "90vh",
        overflow: "auto",
        customContent: (
          <DomainForm
            key={options.domain?.id ?? "new"}
            domain={options.domain}
            onCancel={() => hideModal(modalId)}
            onSaved={(domain) => {
              hideModal(modalId);
              options.onSaved?.(domain);
            }}
          />
        ),
      });
      return modalId;
    },
    [hideModal, showModal],
  );
}

export function useAddDomainModal() {
  const showDomainModal = useDomainModal();

  return useCallback(
    (options?: { onCreated?: (domain: DomainSettingsView) => void }) =>
      showDomainModal({ onSaved: options?.onCreated }),
    [showDomainModal],
  );
}
