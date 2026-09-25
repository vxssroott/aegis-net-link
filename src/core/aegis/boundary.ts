/**
 * AEGIS Core — privacy boundary model.
 *
 * A boundary is the declared relationship between interfaces, routes, DNS,
 * address families, transports and firewall enforcement. It answers
 * "where does traffic leaving this machine actually go?" only when backed
 * by observations; otherwise every field is UNKNOWN.
 */

import type { AssuranceLevel } from "./state";
import type { Observation } from "./observation";

export type TransportKind = "NONE" | "WIREGUARD" | "OPENVPN" | "TOR" | "SOCKS5" | "HTTP_CONNECT";

export interface InterfaceRef {
  /** Stable OS identifier (adapter index/GUID) once the operator supplies it. */
  id: string;
  name?: string;
  kind: "PHYSICAL" | "VIRTUAL" | "TUNNEL" | "UNKNOWN";
}

export interface RouteRef {
  destination: string;
  interfaceId?: string;
  metric?: number;
  /** True when this route carries default egress for its address family. */
  isDefault: boolean;
  family: "IPV4" | "IPV6";
}

export interface DnsPath {
  servers: string[];
  interfaceId?: string;
  /** Whether resolution is constrained to the boundary; UNKNOWN until verified. */
  insideBoundary: "YES" | "NO" | "UNKNOWN";
}

export interface FirewallPosture {
  failClosed: "ENABLED" | "DISABLED" | "UNKNOWN";
  directEgressBlocked: "YES" | "NO" | "UNKNOWN";
  rulesetId?: string;
}

export interface TransportBinding {
  id: string;
  kind: TransportKind;
  /** CONFIGURED != CONNECTED != VERIFIED. */
  assurance: AssuranceLevel;
  interfaceId?: string;
  provider?: string;
}

export interface PrivacyBoundary {
  id: string;
  /** Declared name of the boundary, e.g. "Default boundary". */
  name: string;
  interfaces: InterfaceRef[];
  routes: RouteRef[];
  dns: DnsPath;
  ipv4: { enabled: "YES" | "NO" | "UNKNOWN"; insideBoundary: "YES" | "NO" | "UNKNOWN" };
  ipv6: { enabled: "YES" | "NO" | "UNKNOWN"; insideBoundary: "YES" | "NO" | "UNKNOWN" };
  transports: TransportBinding[];
  firewall: FirewallPosture;
  /** Assurance for the boundary as a whole. Only the runtime may set this. */
  assurance: AssuranceLevel;
  /** Observation ids that the above fields were derived from. */
  derivedFrom: string[];
}

export function emptyBoundary(name = "Default boundary"): PrivacyBoundary {
  return {
    id: "boundary.default",
    name,
    interfaces: [],
    routes: [],
    dns: { servers: [], insideBoundary: "UNKNOWN" },
    ipv4: { enabled: "UNKNOWN", insideBoundary: "UNKNOWN" },
    ipv6: { enabled: "UNKNOWN", insideBoundary: "UNKNOWN" },
    transports: [],
    firewall: { failClosed: "UNKNOWN", directEgressBlocked: "UNKNOWN" },
    assurance: "UNKNOWN",
    derivedFrom: [],
  };
}

/**
 * Project observations onto the boundary model. Anything not observed stays
 * UNKNOWN — this function never infers protection.
 */
export function projectBoundary(observations: Observation[]): PrivacyBoundary {
  const boundary = emptyBoundary();
  boundary.derivedFrom = observations.map((o) => o.id);
  return boundary;
}

/* ---------------------------------------------------------------- keyed projection */

type Tri = "YES" | "NO" | "UNKNOWN";

function tri(observations: Observation[], key: string): Tri {
  const o = observations.find((x) => x.key === key);
  if (!o || typeof o.value !== "boolean") return "UNKNOWN";
  return o.value ? "YES" : "NO";
}

/**
 * Keyed projection used by the runtime. Only boolean observations with a
 * known value move a field away from UNKNOWN.
 */
export function projectBoundaryFrom(observations: Observation[]): PrivacyBoundary {
  const b = emptyBoundary();
  b.derivedFrom = observations.map((o) => o.id);
  b.ipv4.insideBoundary = tri(observations, "boundary.ipv4.inside");
  b.ipv6.insideBoundary = tri(observations, "boundary.ipv6.inside");
  b.dns.insideBoundary = tri(observations, "boundary.dns.inside");
  const fc = tri(observations, "boundary.firewall.failClosed");
  b.firewall.failClosed = fc === "YES" ? "ENABLED" : fc === "NO" ? "DISABLED" : "UNKNOWN";
  b.firewall.directEgressBlocked = tri(observations, "boundary.firewall.directBlocked");
  const verified = tri(observations, "transport.verified");
  const active = observations.find((o) => o.key === "transport.active");
  if (active && typeof active.value === "string") {
    b.transports.push({
      id: active.value,
      kind: "NONE",
      provider: active.value,
      assurance: verified === "YES" ? "VERIFIED" : "CONNECTED",
    });
  }
  return b;
}
