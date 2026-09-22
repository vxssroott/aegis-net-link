/**
 * AEGIS Core — egress identity contracts.
 *
 * Goal: PREVENT UNINTENDED DIRECT EGRESS and VERIFY INTENDED EGRESS.
 * AEGIS makes no claim about how third-party services label an address.
 */

import type { Confidence, Observation } from "./observation";
import type { TransportKind } from "./boundary";

export interface EgressIdentity {
  ipv4: string | null;
  ipv6: string | null;
  /** Only when externally resolvable; never derived from browser geolocation. */
  country: string | null;
  region: string | null;
  asn: string | null;
  provider: string | null;
  transport: TransportKind | "UNKNOWN";
  /** Which external source reported this, e.g. an operator-run consensus probe. */
  verificationSource: string | null;
  timestamp: string | null;
  confidence: Confidence;
  evidence: string[];
}

export function unknownEgress(): EgressIdentity {
  return {
    ipv4: null,
    ipv6: null,
    country: null,
    region: null,
    asn: null,
    provider: null,
    transport: "UNKNOWN",
    verificationSource: null,
    timestamp: null,
    confidence: "NONE",
    evidence: [],
  };
}

export type EgressVerdict =
  | "INTENDED_EGRESS_VERIFIED"
  | "UNINTENDED_DIRECT_EGRESS"
  | "INCONCLUSIVE"
  | "NOT_VERIFIED";

export interface EgressExpectation {
  /** The transport the policy says traffic must leave through. */
  transport: TransportKind;
  /** Baseline ISP-facing identity, captured before a boundary is established. */
  baselineIpv4?: string | null;
  baselineIpv6?: string | null;
}

/**
 * Compare observed egress against expectation. Requires at least two
 * independent observations to reach INTENDED_EGRESS_VERIFIED; anything less is
 * INCONCLUSIVE.
 */
export function evaluateEgress(
  observed: EgressIdentity,
  expectation: EgressExpectation,
  independentSources: number,
): EgressVerdict {
  if (!observed.ipv4 && !observed.ipv6) return "NOT_VERIFIED";

  const matchesBaseline =
    (!!expectation.baselineIpv4 && observed.ipv4 === expectation.baselineIpv4) ||
    (!!expectation.baselineIpv6 && observed.ipv6 === expectation.baselineIpv6);

  if (expectation.transport !== "NONE" && matchesBaseline) return "UNINTENDED_DIRECT_EGRESS";
  if (independentSources < 2 || observed.transport === "UNKNOWN") return "INCONCLUSIVE";
  if (observed.transport !== expectation.transport) return "INCONCLUSIVE";
  return "INTENDED_EGRESS_VERIFIED";
}

/** Contract that a future operator-side probe must implement. */
export interface EgressProbe {
  id: string;
  /** Must run outside the browser; the browser is not a trusted vantage point. */
  observe(): Promise<{ identity: EgressIdentity; observations: Observation[] }>;
}
