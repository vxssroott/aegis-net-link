/**
 * AEGIS Core — independent verification engine foundation.
 *
 * Configuration presence is not proof. Every check must test actual behaviour
 * through a vantage point AEGIS trusts. Where no such vantage point exists in
 * Phase 1, the check reports NOT_IMPLEMENTED — never VERIFIED.
 */

import type { Observation } from "./observation";
import type { PolicyContext } from "./policy";

export type VerificationStatus = "VERIFIED" | "FAILED" | "INCONCLUSIVE" | "NOT_IMPLEMENTED";

export type VerificationTarget =
  | "EXTERNAL_ENDPOINT"
  | "ROUTE_BINDING"
  | "DNS_PATH"
  | "IPV6_BOUNDARY"
  | "FIREWALL_ENFORCEMENT"
  | "TRANSPORT_PROVIDER"
  | "WEBRTC_EXPOSURE";

export interface VerificationResult {
  checkId: string;
  target: VerificationTarget;
  status: VerificationStatus;
  reason: string;
  method: string;
  observations: Observation[];
  timestamp: string;
}

export interface VerificationCheck {
  id: string;
  target: VerificationTarget;
  /** Describes the independent test that would prove the claim. */
  method: string;
  run(ctx: PolicyContext): Promise<VerificationResult>;
}

export function notImplemented(
  id: string,
  target: VerificationTarget,
  method: string,
  reason: string,
): VerificationCheck {
  return {
    id,
    target,
    method,
    run: async () => ({
      checkId: id,
      target,
      status: "NOT_IMPLEMENTED",
      reason,
      method,
      observations: [],
      timestamp: new Date().toISOString(),
    }),
  };
}

export class VerificationRegistry {
  private readonly checks = new Map<string, VerificationCheck>();

  register(...checks: VerificationCheck[]): void {
    for (const c of checks) this.checks.set(c.id, c);
  }

  list(): VerificationCheck[] {
    return [...this.checks.values()];
  }

  async runAll(ctx: PolicyContext): Promise<VerificationResult[]> {
    return Promise.all(
      this.list().map(async (check) => {
        try {
          return await check.run(ctx);
        } catch (error) {
          return {
            checkId: check.id,
            target: check.target,
            status: "INCONCLUSIVE" as const,
            reason: `Check threw: ${(error as Error).message}`,
            method: check.method,
            observations: [],
            timestamp: new Date().toISOString(),
          };
        }
      }),
    );
  }
}

/** Overall verification outcome. VERIFIED requires every check to be VERIFIED. */
export function summarize(results: VerificationResult[]): VerificationStatus {
  if (results.length === 0) return "NOT_IMPLEMENTED";
  if (results.some((r) => r.status === "FAILED")) return "FAILED";
  if (results.every((r) => r.status === "VERIFIED")) return "VERIFIED";
  if (results.every((r) => r.status === "NOT_IMPLEMENTED")) return "NOT_IMPLEMENTED";
  return "INCONCLUSIVE";
}

/**
 * The Phase 1 check set. Each entry documents the independent test the
 * privileged operator must implement in a later phase.
 */
export function defaultChecks(): VerificationCheck[] {
  return [
    notImplemented(
      "check.external-endpoint",
      "EXTERNAL_ENDPOINT",
      "Multi-source external address consensus executed outside the browser.",
      "No trusted external vantage point is wired up yet.",
    ),
    notImplemented(
      "check.route-binding",
      "ROUTE_BINDING",
      "Compare the active default route interface against the boundary tunnel interface.",
      "Requires the privileged operator's route reader.",
    ),
    notImplemented(
      "check.dns-path",
      "DNS_PATH",
      "Resolve a controlled name and confirm the query exited via the boundary.",
      "Requires operator-side resolver instrumentation.",
    ),
    notImplemented(
      "check.ipv6-boundary",
      "IPV6_BOUNDARY",
      "Confirm IPv6 is disabled or bound to the tunnel, with no independent egress.",
      "Requires operator-side IPv6 observation.",
    ),
    notImplemented(
      "check.firewall-enforcement",
      "FIREWALL_ENFORCEMENT",
      "Attempt a non-boundary egress socket and confirm it is refused.",
      "Requires the privileged operator's firewall probe.",
    ),
    notImplemented(
      "check.transport-provider",
      "TRANSPORT_PROVIDER",
      "Provider-declared liveness test for the active transport.",
      "No transport provider is implemented in Phase 1.",
    ),
    notImplemented(
      "check.webrtc-exposure",
      "WEBRTC_EXPOSURE",
      "Enumerate ICE candidates and compare against the boundary address set.",
      "Only observable in a client context and not yet wired to the boundary model.",
    ),
  ];
}

/**
 * Check that adopts a proof reported by the local AEGIS control plane
 * (observation key `proof.<target>`). PASS -> VERIFIED, FAIL -> FAILED,
 * anything else -> INCONCLUSIVE. The browser performs no test itself.
 */
export function controlPlaneProofCheck(
  id: string,
  target: VerificationTarget,
  proofKey: string,
): VerificationCheck {
  const method = `control-plane proof: ${proofKey}`;
  return {
    id,
    target,
    method,
    run: async ({ observations }) => {
      const o = observations.get<string>(`proof.${proofKey}`);
      const raw = o && typeof o.value === "string" ? o.value.toUpperCase() : undefined;
      const status: VerificationStatus =
        raw === "PASS" ? "VERIFIED" : raw === "FAIL" ? "FAILED" : "INCONCLUSIVE";
      return {
        checkId: id,
        target,
        status,
        reason: raw ? `Control plane reported ${raw}` : "No proof reported by control plane",
        method,
        observations: o ? [o] : [],
        timestamp: new Date().toISOString(),
      };
    },
  };
}

export function controlPlaneChecks(): VerificationCheck[] {
  return [
    controlPlaneProofCheck("check.external-endpoint", "EXTERNAL_ENDPOINT", "externalEndpoint"),
    controlPlaneProofCheck("check.route-binding", "ROUTE_BINDING", "routeBinding"),
    controlPlaneProofCheck("check.dns-path", "DNS_PATH", "dnsPath"),
    controlPlaneProofCheck("check.ipv6-boundary", "IPV6_BOUNDARY", "ipv6Boundary"),
    controlPlaneProofCheck("check.transport-provider", "TRANSPORT_PROVIDER", "provider"),
  ];
}
