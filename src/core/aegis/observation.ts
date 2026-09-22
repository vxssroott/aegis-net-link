/**
 * AEGIS Core — normalized observation model.
 *
 * Every fact AEGIS knows is an Observation. An unobservable fact is recorded
 * as UNKNOWN with confidence NONE — never guessed, never synthesised.
 */

export const OBSERVATION_CATEGORIES = [
  "NETWORK_INTERFACE",
  "ROUTE",
  "DNS",
  "IPV4",
  "IPV6",
  "FIREWALL",
  "VPN",
  "TOR",
  "PROXY",
  "SOCKET",
  "EGRESS",
  "LOCATION",
  "PERMISSION",
  "PROCESS",
  "SYSTEM",
] as const;

export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

export type Confidence = "NONE" | "LOW" | "MEDIUM" | "HIGH";

/** Where an observation came from, and therefore how far it can be trusted. */
export type ObservationSourceKind =
  | "LOCAL_RUNTIME"
  | "PRIVILEGED_OPERATOR"
  | "CONTROL_PLANE"
  | "EXTERNAL_SERVICE"
  | "BROWSER"
  | "USER_DECLARED";

/** Data-handling classification. Nothing is collected implicitly. */
export type DataHandling =
  | "OBSERVED_BY_SERVER"
  | "OBSERVED_LOCALLY"
  | "STORED_LOCALLY"
  | "TRANSMITTED_TO_CLOUD"
  | "RETAINED_FOR_AUDIT";

export const UNKNOWN = Symbol.for("aegis.unknown");
export type Unknown = typeof UNKNOWN;

export interface Observation<T = unknown> {
  id: string;
  category: ObservationCategory;
  /** Stable key within the category, e.g. "egress.ipv4". */
  key: string;
  source: ObservationSourceKind;
  /** Concrete collection mechanism, e.g. "Get-NetRoute", "fetch:/network/state". */
  method: string;
  timestamp: string;
  value: T | Unknown;
  confidence: Confidence;
  /** Interface / adapter / tunnel this observation is about, when applicable. */
  resource?: string;
  handling: DataHandling[];
  evidence?: Record<string, unknown>;
  /** ISO timestamp after which this observation must not be trusted. */
  expiresAt?: string;
}

let counter = 0;

function nextId(key: string): string {
  counter += 1;
  return `obs_${key}_${counter}`;
}

export function observe<T>(input: {
  category: ObservationCategory;
  key: string;
  source: ObservationSourceKind;
  method: string;
  value: T | Unknown;
  confidence: Confidence;
  resource?: string;
  handling?: DataHandling[];
  evidence?: Record<string, unknown>;
  ttlMs?: number;
}): Observation<T> {
  const now = new Date();
  return {
    id: nextId(input.key),
    category: input.category,
    key: input.key,
    source: input.source,
    method: input.method,
    timestamp: now.toISOString(),
    value: input.value,
    confidence: input.value === UNKNOWN ? "NONE" : input.confidence,
    resource: input.resource,
    handling: input.handling ?? ["OBSERVED_LOCALLY"],
    evidence: input.evidence,
    expiresAt: input.ttlMs ? new Date(now.getTime() + input.ttlMs).toISOString() : undefined,
  };
}

export function unknown<T>(
  category: ObservationCategory,
  key: string,
  method: string,
  reason: string,
  source: ObservationSourceKind = "LOCAL_RUNTIME",
): Observation<T> {
  return observe<T>({
    category,
    key,
    source,
    method,
    value: UNKNOWN,
    confidence: "NONE",
    evidence: { reason },
  });
}

export function isKnown<T>(o: Observation<T> | undefined): o is Observation<T> & { value: T } {
  return !!o && o.value !== UNKNOWN;
}

export function isExpired(o: Observation, at: Date = new Date()): boolean {
  return !!o.expiresAt && new Date(o.expiresAt).getTime() <= at.getTime();
}

/** In-memory, latest-wins observation store keyed by `key`. */
export class ObservationStore {
  private readonly byKey = new Map<string, Observation>();

  put(...observations: Observation[]): void {
    for (const o of observations) this.byKey.set(o.key, o);
  }

  get<T = unknown>(key: string): Observation<T> | undefined {
    const o = this.byKey.get(key) as Observation<T> | undefined;
    if (o && isExpired(o)) return undefined;
    return o;
  }

  value<T = unknown>(key: string): T | undefined {
    const o = this.get<T>(key);
    return isKnown(o) ? o.value : undefined;
  }

  all(): Observation[] {
    return [...this.byKey.values()];
  }

  clear(): void {
    this.byKey.clear();
  }
}

/** A source of observations. Sources must never fabricate values. */
export interface ObservationSource {
  id: string;
  kind: ObservationSourceKind;
  /** Capabilities that must be granted before this source may run. */
  requires: string[];
  collect(): Promise<Observation[]>;
}
