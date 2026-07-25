import { api } from "./client";
import { endpoints } from "./endpoints";

export type OperationStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "needs_action";

export type OperationKind = "project_delete" | "deployment_delete";

export interface ResourceOperationView {
  id: string;
  kind: OperationKind;
  resourceType: "project" | "deployment";
  resourceId: string;
  status: OperationStatus;
  currentStep: string | null;
  progress: { current: number; total: number };
  attemptCount: number;
  result: {
    rowDeleted?: boolean;
    alreadyDeleted?: boolean;
    steps?: Array<{ step: string; status: string; error?: string; details?: string }>;
    unrecoverable?: Array<{ step: string; status: string; error?: string }>;
    orphaned?: Array<Record<string, unknown>>;
    rejection?: string | null;
  } | null;
  error: { code: string | null; message: string | null } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export const operationsApi = {
  get: (id: string) =>
    api.get<{ data: ResourceOperationView }>(endpoints.operations.item(id)),

  getActive: (kind: OperationKind, resourceId: string) =>
    api.get<{ data: ResourceOperationView }>(endpoints.operations.active, {
      params: { kind, resourceId },
    }),
};
