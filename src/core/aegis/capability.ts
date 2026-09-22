/**
 * AEGIS Core — capability / permission model.
 *
 * Capabilities are requested per concrete need, never up front and never
 * implicitly. Location is optional and no network privacy function depends
 * on it.
 */

export const CAPABILITIES = [
  "NETWORK_DIAGNOSTICS",
  "NETWORK_STATE_OBSERVATION",
  "LOCAL_NETWORK_CONTROL",
  "FIREWALL_CONTROL",
  "ROUTE_INTERFACE_CONTROL",
  "VPN_INTEGRATION",
  "TOR_INTEGRATION",
  "PROXY_INTEGRATION",
  "LOCATION_ACCESS",
  "NOTIFICATIONS",
  "CLOUD_SYNC",
  "TELEMETRY",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type GrantState = "GRANTED" | "DENIED" | "NOT_REQUESTED";

export interface CapabilityDescriptor {
  id: Capability;
  label: string;
  /** What breaks without it — used by the UI, never a scare prompt. */
  purpose: string;
  privileged: boolean;
  optional: boolean;
  /** True when the capability leaves the machine. */
  leavesDevice: boolean;
}

export const CAPABILITY_REGISTRY: Readonly<Record<Capability, CapabilityDescriptor>> = {
  NETWORK_DIAGNOSTICS: {
    id: "NETWORK_DIAGNOSTICS",
    label: "Network diagnostics",
    purpose: "Run local reachability and path checks.",
    privileged: false,
    optional: false,
    leavesDevice: false,
  },
  NETWORK_STATE_OBSERVATION: {
    id: "NETWORK_STATE_OBSERVATION",
    label: "Network state observation",
    purpose: "Read interfaces, routes and DNS configuration.",
    privileged: false,
    optional: false,
    leavesDevice: false,
  },
  LOCAL_NETWORK_CONTROL: {
    id: "LOCAL_NETWORK_CONTROL",
    label: "Local network control",
    purpose: "Apply local network changes through the privileged operator.",
    privileged: true,
    optional: true,
    leavesDevice: false,
  },
  FIREWALL_CONTROL: {
    id: "FIREWALL_CONTROL",
    label: "Firewall control",
    purpose: "Enforce fail-closed rules and kill-switch behaviour.",
    privileged: true,
    optional: true,
    leavesDevice: false,
  },
  ROUTE_INTERFACE_CONTROL: {
    id: "ROUTE_INTERFACE_CONTROL",
    label: "Route and interface control",
    purpose: "Bind traffic to an intended boundary interface.",
    privileged: true,
    optional: true,
    leavesDevice: false,
  },
  VPN_INTEGRATION: {
    id: "VPN_INTEGRATION",
    label: "VPN integration",
    purpose: "Establish and verify tunnel transports.",
    privileged: true,
    optional: true,
    leavesDevice: true,
  },
  TOR_INTEGRATION: {
    id: "TOR_INTEGRATION",
    label: "Tor integration",
    purpose: "Route traffic through a Tor circuit.",
    privileged: false,
    optional: true,
    leavesDevice: true,
  },
  PROXY_INTEGRATION: {
    id: "PROXY_INTEGRATION",
    label: "Proxy integration",
    purpose: "Route traffic through SOCKS5 / HTTP CONNECT egress.",
    privileged: false,
    optional: true,
    leavesDevice: true,
  },
  LOCATION_ACCESS: {
    id: "LOCATION_ACCESS",
    label: "Location access",
    purpose: "Optional context only. Never required for privacy enforcement.",
    privileged: false,
    optional: true,
    leavesDevice: false,
  },
  NOTIFICATIONS: {
    id: "NOTIFICATIONS",
    label: "Notifications",
    purpose: "Alert on boundary loss while the UI is closed.",
    privileged: false,
    optional: true,
    leavesDevice: false,
  },
  CLOUD_SYNC: {
    id: "CLOUD_SYNC",
    label: "Cloud synchronisation",
    purpose: "Optional config sync. Core operation never depends on it.",
    privileged: false,
    optional: true,
    leavesDevice: true,
  },
  TELEMETRY: {
    id: "TELEMETRY",
    label: "Telemetry",
    purpose: "Optional diagnostics upload. Off unless explicitly granted.",
    privileged: false,
    optional: true,
    leavesDevice: true,
  },
};

export interface CapabilityGrant {
  capability: Capability;
  state: GrantState;
  decidedAt?: string | undefined;
  /** Who decided: the local user, or a policy import. */
  decidedBy?: "USER" | "POLICY" | undefined;
}

export interface CapabilityStorage {
  read(): Record<string, CapabilityGrant> | null;
  write(value: Record<string, CapabilityGrant>): void;
}

export const memoryCapabilityStorage = (): CapabilityStorage => {
  let store: Record<string, CapabilityGrant> | null = null;
  return {
    read: () => store,
    write: (value) => {
      store = value;
    },
  };
};

const STORAGE_KEY = "aegis.capabilities.v1";

export const localCapabilityStorage = (): CapabilityStorage => ({
  read() {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, CapabilityGrant>;
    } catch {
      return null;
    }
  },
  write(value) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
});

export class CapabilityManager {
  private grants: Record<string, CapabilityGrant>;

  constructor(private readonly storage: CapabilityStorage = memoryCapabilityStorage()) {
    this.grants = storage.read() ?? {};
  }

  state(capability: Capability): GrantState {
    return this.grants[capability]?.state ?? "NOT_REQUESTED";
  }

  isGranted(capability: Capability): boolean {
    return this.state(capability) === "GRANTED";
  }

  /** All capabilities in `required` that are not currently granted. */
  missing(required: readonly Capability[]): Capability[] {
    return required.filter((c) => !this.isGranted(c));
  }

  set(capability: Capability, state: GrantState, decidedBy: "USER" | "POLICY" = "USER"): void {
    this.grants = {
      ...this.grants,
      [capability]: { capability, state, decidedAt: new Date().toISOString(), decidedBy },
    };
    this.storage.write(this.grants);
  }

  list(): CapabilityGrant[] {
    return (Object.keys(CAPABILITY_REGISTRY) as Capability[]).map((c) => ({
      capability: c,
      state: this.state(c),
      decidedAt: this.grants[c]?.decidedAt,
      decidedBy: this.grants[c]?.decidedBy,
    }));
  }
}
