/**
 * AEGIS Core — observation sources available in Phase 1.
 *
 * - connectivitySource: browser online/offline flag (SYSTEM, LOW confidence).
 * - controlPlaneSource: reads GET /network/state from the local AEGIS control
 *   plane and normalises it into observations. Missing values become UNKNOWN.
 */

import { observe, unknown, type Observation, type ObservationSource } from "./observation";

type Json = Record<string, unknown>;

const TTL = 60_000;

function cp<T>(category: Observation["category"], key: string, value: T | null | undefined): Observation {
  if (value === null || value === undefined || value === "") {
    return unknown(category, key, "fetch:/network/state", "Not reported by control plane", "CONTROL_PLANE");
  }
  return observe<T>({
    category,
    key,
    source: "CONTROL_PLANE",
    method: "fetch:/network/state",
    value,
    confidence: "MEDIUM",
    handling: ["OBSERVED_LOCALLY"],
    ttlMs: TTL,
  });
}

function proof(v: Json, key: string): string | null {
  const upper = key.charAt(0).toUpperCase() + key.slice(1);
  const raw = v[key] ?? v[`${key}Proof`] ?? v[`${upper}Proof`];
  if (raw === true) return "PASS";
  if (raw === false) return "FAIL";
  return raw === undefined || raw === null ? null : String(raw);
}

/** Pure mapping — exported for tests. */
export function normalizeControlPlaneState(state: Json): Observation[] {
  const identity = (state["identity"] ?? {}) as Json;
  const network = (state["network"] ?? {}) as Json;
  const exposure = (state["exposure"] ?? {}) as Json;
  const verification = (state["verification"] ?? {}) as Json;
  const transport = (state["transport"] ?? {}) as Json;
  const boundary = (state["boundary"] ?? {}) as Json;
  const bool = (x: unknown) => (typeof x === "boolean" ? x : null);

  return [
    cp("SYSTEM", "controlPlane.reachable", true),
    cp("SYSTEM", "controlPlane.status", state["status"]),
    cp("EGRESS", "egress.ipv4", identity["ipv4"]),
    cp("EGRESS", "egress.ipv6", identity["ipv6"]),
    cp("EGRESS", "egress.asn", identity["asn"]),
    cp("EGRESS", "egress.provider", identity["provider"]),
    cp("LOCATION", "egress.location", identity["location"]),
    cp("NETWORK_INTERFACE", "net.interface", network["interface"]),
    cp("IPV4", "net.localIpv4", network["localIpv4"]),
    cp("ROUTE", "net.gateway", network["gateway"]),
    cp("DNS", "net.dns", network["dns"]),
    cp("ROUTE", "net.route", network["route"]),
    cp("IPV4", "boundary.ipv4.inside", bool(exposure["ipv4"])),
    cp("IPV6", "boundary.ipv6.inside", bool(exposure["ipv6"])),
    cp("DNS", "boundary.dns.inside", bool(exposure["dns"])),
    cp("ROUTE", "boundary.route.inside", bool(exposure["route"])),
    cp("SOCKET", "boundary.webrtc.inside", bool(exposure["webrtc"])),
    cp("FIREWALL", "boundary.firewall.failClosed", bool(boundary["failClosed"])),
    cp("FIREWALL", "boundary.firewall.directBlocked", bool(boundary["directEgressBlocked"])),
    cp("VPN", "transport.active", (transport["activeProvider"] ?? transport["ActiveProvider"] ?? null) as string | null),
    cp("VPN", "transport.verified", bool(transport["verified"] ?? transport["Verified"])),
    cp("SYSTEM", "verification.status", verification["status"]),
    ...["externalEndpoint", "routeBinding", "dnsPath", "ipv6Boundary", "provider"].map((k) =>
      cp("SYSTEM", `proof.${k}`, proof(verification, k)),
    ),
  ];
}

export function controlPlaneSource(fetchState: () => Promise<Json>): ObservationSource {
  return {
    id: "source.control-plane",
    kind: "CONTROL_PLANE",
    requires: ["NETWORK_STATE_OBSERVATION"],
    async collect() {
      try {
        return normalizeControlPlaneState(await fetchState());
      } catch (error) {
        return [
          observe<boolean>({
            category: "SYSTEM",
            key: "controlPlane.reachable",
            source: "CONTROL_PLANE",
            method: "fetch:/network/state",
            value: false,
            confidence: "HIGH",
            evidence: { error: (error as Error).message },
          }),
        ];
      }
    },
  };
}

export function connectivitySource(isOnline: () => boolean): ObservationSource {
  return {
    id: "source.connectivity",
    kind: "BROWSER",
    requires: [],
    async collect() {
      return [
        observe<boolean>({
          category: "SYSTEM",
          key: "system.online",
          source: "BROWSER",
          method: "navigator.onLine",
          value: isOnline(),
          confidence: "LOW",
        }),
      ];
    },
  };
}
