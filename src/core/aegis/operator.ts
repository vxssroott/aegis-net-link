/**
 * AEGIS Core — privileged operator boundary.
 *
 * The control plane runs unprivileged. Only the operator performs narrowly
 * scoped privileged operations, each gated on a specific capability. Phase 1
 * ships the contract and a null implementation — no privileged execution.
 */

import type { Capability } from "./capability";

export type OperatorOperationId =
  | "FIREWALL_APPLY_FAIL_CLOSED"
  | "FIREWALL_RELEASE"
  | "ROUTE_BIND_BOUNDARY"
  | "ROUTE_RESTORE"
  | "INTERFACE_SET_STATE"
  | "DNS_SET_BOUNDARY"
  | "DNS_RESTORE"
  | "TRANSPORT_ESTABLISH"
  | "TRANSPORT_TEARDOWN"
  | "KILL_SWITCH_ENGAGE"
  | "KILL_SWITCH_RELEASE";

export interface OperatorOperationDescriptor {
  id: OperatorOperationId;
  /** Least-privilege scope this operation is allowed to touch. */
  scope: string;
  requires: Capability[];
  reversible: boolean;
  /** Operation executed to restore prior state if this one must be rolled back. */
  rollback?: OperatorOperationId | undefined;
}

export const OPERATOR_OPERATIONS: Readonly<
  Record<OperatorOperationId, OperatorOperationDescriptor>
> = {
  FIREWALL_APPLY_FAIL_CLOSED: {
    id: "FIREWALL_APPLY_FAIL_CLOSED",
    scope: "Windows Firewall: AEGIS rule group only",
    requires: ["FIREWALL_CONTROL"],
    reversible: true,
    rollback: "FIREWALL_RELEASE",
  },
  FIREWALL_RELEASE: {
    id: "FIREWALL_RELEASE",
    scope: "Windows Firewall: AEGIS rule group only",
    requires: ["FIREWALL_CONTROL"],
    reversible: false,
  },
  ROUTE_BIND_BOUNDARY: {
    id: "ROUTE_BIND_BOUNDARY",
    scope: "Default route for the boundary interface",
    requires: ["ROUTE_INTERFACE_CONTROL"],
    reversible: true,
    rollback: "ROUTE_RESTORE",
  },
  ROUTE_RESTORE: {
    id: "ROUTE_RESTORE",
    scope: "Default route snapshot restore",
    requires: ["ROUTE_INTERFACE_CONTROL"],
    reversible: false,
  },
  INTERFACE_SET_STATE: {
    id: "INTERFACE_SET_STATE",
    scope: "Single named adapter",
    requires: ["ROUTE_INTERFACE_CONTROL"],
    reversible: true,
  },
  DNS_SET_BOUNDARY: {
    id: "DNS_SET_BOUNDARY",
    scope: "Resolver list of the boundary interface",
    requires: ["LOCAL_NETWORK_CONTROL"],
    reversible: true,
    rollback: "DNS_RESTORE",
  },
  DNS_RESTORE: {
    id: "DNS_RESTORE",
    scope: "Resolver list snapshot restore",
    requires: ["LOCAL_NETWORK_CONTROL"],
    reversible: false,
  },
  TRANSPORT_ESTABLISH: {
    id: "TRANSPORT_ESTABLISH",
    scope: "One transport provider instance",
    requires: ["VPN_INTEGRATION"],
    reversible: true,
    rollback: "TRANSPORT_TEARDOWN",
  },
  TRANSPORT_TEARDOWN: {
    id: "TRANSPORT_TEARDOWN",
    scope: "One transport provider instance",
    requires: ["VPN_INTEGRATION"],
    reversible: false,
  },
  KILL_SWITCH_ENGAGE: {
    id: "KILL_SWITCH_ENGAGE",
    scope: "Block all egress outside the boundary interface",
    requires: ["FIREWALL_CONTROL"],
    reversible: true,
    rollback: "KILL_SWITCH_RELEASE",
  },
  KILL_SWITCH_RELEASE: {
    id: "KILL_SWITCH_RELEASE",
    scope: "Remove AEGIS egress block",
    requires: ["FIREWALL_CONTROL"],
    reversible: false,
  },
};

export interface OperatorRequest {
  operation: OperatorOperationId;
  parameters?: Record<string, string | number | boolean> | undefined;
  /** Correlates the request with the evidence record that justified it. */
  evidenceId?: string | undefined;
}

export type OperatorOutcome = "APPLIED" | "REJECTED" | "UNAVAILABLE" | "ROLLED_BACK";

export interface OperatorResponse {
  operation: OperatorOperationId;
  outcome: OperatorOutcome;
  reason: string;
  timestamp: string;
  /** Snapshot token the operator can use to roll this operation back. */
  rollbackToken?: string | undefined;
}

export interface PrivilegedOperator {
  id: string;
  available(): Promise<boolean>;
  execute(request: OperatorRequest): Promise<OperatorResponse>;
  rollback(token: string): Promise<OperatorResponse>;
}

/** Phase 1 default: no privileged execution exists, and none is faked. */
export const nullOperator: PrivilegedOperator = {
  id: "operator.null",
  available: async () => false,
  execute: async (request) => ({
    operation: request.operation,
    outcome: "UNAVAILABLE",
    reason: "No privileged AEGIS operator is installed on this machine.",
    timestamp: new Date().toISOString(),
  }),
  rollback: async () => ({
    operation: "FIREWALL_RELEASE",
    outcome: "UNAVAILABLE",
    reason: "No privileged AEGIS operator is installed on this machine.",
    timestamp: new Date().toISOString(),
  }),
};
