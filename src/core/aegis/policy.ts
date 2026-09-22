/**
 * AEGIS Core — policy engine foundation.
 *
 * POLICY -> OBSERVATIONS -> EVALUATION -> VERDICT -> EVIDENCE.
 * A rule that cannot be evaluated returns UNKNOWN. UNKNOWN is never PASS.
 */

import type { ObservationStore } from "./observation";
import type { PrivacyBoundary, TransportKind } from "./boundary";

export type RuleStatus = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";

export interface PolicyContext {
  observations: ObservationStore;
  boundary: PrivacyBoundary;
}

export interface RuleResult {
  ruleId: string;
  status: RuleStatus;
  reason: string;
  /** Observation ids consulted — the evidence path for this result. */
  observationIds: string[];
}

export interface PolicyRule {
  id: string;
  requirement: string;
  /** Rule severity: a FAIL on a critical rule forces fail-closed handling. */
  critical: boolean;
  evaluate(ctx: PolicyContext): RuleResult;
}

export interface AegisPolicy {
  id: string;
  name: string;
  failClosed: boolean;
  requiredTransport: TransportKind;
  rules: PolicyRule[];
}

export type PolicyVerdictKind = "CONFORMANT" | "NON_CONFORMANT" | "INDETERMINATE";

export interface PolicyVerdict {
  policyId: string;
  verdict: PolicyVerdictKind;
  results: RuleResult[];
  timestamp: string;
}

export function evaluatePolicy(policy: AegisPolicy, ctx: PolicyContext): PolicyVerdict {
  const results = policy.rules.map((rule) => {
    try {
      return rule.evaluate(ctx);
    } catch (error) {
      return {
        ruleId: rule.id,
        status: "UNKNOWN" as const,
        reason: `Rule threw: ${(error as Error).message}`,
        observationIds: [],
      };
    }
  });

  const applicable = results.filter((r) => r.status !== "NOT_APPLICABLE");
  const anyFail = applicable.some((r) => r.status === "FAIL");
  const anyUnknown = applicable.some((r) => r.status === "UNKNOWN");

  const verdict: PolicyVerdictKind = anyFail
    ? "NON_CONFORMANT"
    : anyUnknown || applicable.length === 0
      ? "INDETERMINATE"
      : "CONFORMANT";

  return { policyId: policy.id, verdict, results, timestamp: new Date().toISOString() };
}

/* ------------------------------------------------------------- baseline */

function boundaryRule(
  id: string,
  requirement: string,
  critical: boolean,
  read: (b: PrivacyBoundary) => "YES" | "NO" | "UNKNOWN" | "ENABLED" | "DISABLED",
): PolicyRule {
  return {
    id,
    requirement,
    critical,
    evaluate: ({ boundary }) => {
      const value = read(boundary);
      const status: RuleStatus =
        value === "YES" || value === "ENABLED"
          ? "PASS"
          : value === "NO" || value === "DISABLED"
            ? "FAIL"
            : "UNKNOWN";
      return {
        ruleId: id,
        status,
        reason: `Observed value: ${value}`,
        observationIds: boundary.derivedFrom,
      };
    },
  };
}

/**
 * The default local policy. Every rule reports UNKNOWN until the privileged
 * operator supplies real observations — that is the correct Phase 1 answer.
 */
export function defaultPolicy(): AegisPolicy {
  return {
    id: "policy.default.local",
    name: "Default local boundary policy",
    failClosed: true,
    requiredTransport: "NONE",
    rules: [
      boundaryRule(
        "rule.tunnel.required",
        "Traffic must leave through the declared tunnel transport.",
        true,
        (b) => (b.transports.some((t) => t.assurance === "VERIFIED") ? "YES" : "UNKNOWN"),
      ),
      boundaryRule(
        "rule.direct-egress.blocked",
        "Direct (non-boundary) egress must be blocked.",
        true,
        (b) => b.firewall.directEgressBlocked,
      ),
      boundaryRule(
        "rule.dns.inside-boundary",
        "DNS resolution must stay inside the boundary.",
        true,
        (b) => b.dns.insideBoundary,
      ),
      boundaryRule(
        "rule.ipv6.no-bypass",
        "IPv6 must not bypass the boundary.",
        true,
        (b) => (b.ipv6.enabled === "NO" ? "YES" : b.ipv6.insideBoundary),
      ),
      boundaryRule(
        "rule.ipv4.inside-boundary",
        "IPv4 egress must stay inside the boundary.",
        true,
        (b) => b.ipv4.insideBoundary,
      ),
      boundaryRule(
        "rule.fail-closed",
        "Fail-closed enforcement must be enabled.",
        true,
        (b) => b.firewall.failClosed,
      ),
    ],
  };
}
