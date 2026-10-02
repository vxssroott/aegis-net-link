import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AEGIS_ENDPOINTS,
  aegisApi,
  discoverAgent,
  getApiBase,
  setApiBase,
  type AegisEvent,
  type AegisProvider,
  type AegisState,
} from "@/lib/aegis-control-plane";
import { AegisCoreRuntime, type RuntimeSnapshot } from "@/core/aegis/runtime";
import { connectivitySource, controlPlaneSource } from "@/core/aegis/sources";
import { CapabilityManager, localCapabilityStorage } from "@/core/aegis/capability";
import "@/styles/aegis.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AEGIS — Privacy Control Plane" },
      {
        name: "description",
        content:
          "AEGIS control and observation surface: network identity, exposure, transport fabric and verification state from the AEGIS control plane.",
      },
      { property: "og:title", content: "AEGIS — Privacy Control Plane" },
      {
        property: "og:description",
        content:
          "Observe network identity, exposure, transport fabric and verification proofs reported by the AEGIS control plane.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Aegis,
  ssr: false,
});

/* ---------------------------------------------------------------- helpers */

function text(value: unknown): string {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function resultClass(value: string): string {
  const upper = value.toUpperCase();
  if (
    upper.includes("PASS") ||
    upper.includes("VERIFIED") ||
    upper.includes("PROTECTED") ||
    upper.includes("ACTIVE")
  ) {
    return "value good";
  }
  if (
    upper.includes("PENDING") ||
    upper.includes("UNKNOWN") ||
    upper.includes("DEGRADED") ||
    upper.includes("AVAILABLE")
  ) {
    return "value warn";
  }
  if (
    upper.includes("FAIL") ||
    upper.includes("EXPOSED") ||
    upper.includes("DIRECT") ||
    upper.includes("UNAVAILABLE") ||
    upper.includes("POTENTIAL") ||
    upper.includes("NO VERIFIED")
  ) {
    return "value bad";
  }
  return "value";
}

function proofValue(object: Record<string, unknown> | undefined, key: string): string {
  if (!object) return "PENDING";

  const upper = key.charAt(0).toUpperCase() + key.slice(1);
  const value = object[key] ?? object[`${key}Proof`] ?? object[`${upper}Proof`];

  if (value === true) return "PASS";
  if (value === false) return "FAIL";
  if (value === undefined || value === null) return "PENDING";
  return String(value);
}

function exposureLabel(
  label: string,
  value: boolean | null | undefined,
  protectedText: string,
  exposedText: string,
): string {
  if (value === true) return `● ${protectedText}`;
  if (value === false) return `● ${exposedText}`;
  return `● ${label} UNKNOWN`;
}

interface UiEvent {
  key: string;
  time: string;
  message: string;
}

/* ---------------------------------------------------------------- component */

// Module-level guard: React StrictMode remounts create fresh refs, so a ref
// alone cannot prevent duplicate startup work. This survives remounts.
let aegisStarted = false;

function Aegis() {
  const [state, setState] = useState<AegisState | null>(null);
  const [providers, setProviders] = useState<AegisProvider[] | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState("INITIALIZING");
  const [statusMode, setStatusMode] = useState<"normal" | "protected" | "danger">("normal");
  const [heroState, setHeroState] = useState("OBSERVING");
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [apiBase, setApiBaseValue] = useState("");

  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const runtimeRef = useRef<AegisCoreRuntime | null>(null);
  const busyRef = useRef(false);
  const startedRef = useRef(false);
  const snapshotRef = useRef<RuntimeSnapshot | null>(null);
  const [step, setStep] = useState("");
  const [agentBase, setAgentBase] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only the AEGIS core runtime decides PROTECTED — from policy + verification evidence.
  const isProtected = snapshot?.state === "PROTECTED";

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(""), 3000);
  }, []);

  const addNotice = useCallback((message: string) => {
    setEvents((current) =>
      [
        {
          key: `local-${Date.now()}-${Math.random()}`,
          time: new Date().toLocaleTimeString(),
          message,
        },
        ...current,
      ].slice(0, 12),
    );
  }, []);

  /* Event stream: GET /events — AEGIS event bus, never synthesised. */
  const loadEvents = useCallback(async () => {
    try {
      const result = await aegisApi<{ events?: AegisEvent[] } | AegisEvent[]>(
        AEGIS_ENDPOINTS.events,
      );
      const list = Array.isArray(result) ? result : result.events || [];

      const remote = list
        .slice()
        .reverse()
        .slice(0, 12)
        .map((item, index) => ({
          key: "cp-" + (item.id || `${item.timestamp}-${index}`),
          time: item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString()
            : new Date().toLocaleTimeString(),
          message: item.message || item.type || "AEGIS event",
        }));
      setEvents((current) => {
        const local = current.filter((e) => !e.key.startsWith("cp-"));
        return [...local.slice(0, 6), ...remote].slice(0, 12);
      });
    } catch {
      /* event stream unavailable — leave existing notices in place */
    }
  }, []);

  const getRuntime = useCallback(() => {
    if (!runtimeRef.current) {
      const capabilities = new CapabilityManager(localCapabilityStorage());
      if (capabilities.state("NETWORK_STATE_OBSERVATION") === "NOT_REQUESTED") {
        // Observing the local control plane is the purpose of this surface.
        capabilities.set("NETWORK_STATE_OBSERVATION", "GRANTED", "POLICY");
      }
      const runtime = new AegisCoreRuntime(
        [
          connectivitySource(() => navigator.onLine),
          controlPlaneSource(async () => {
            try {
              const next = await aegisApi<AegisState>(AEGIS_ENDPOINTS.state);
              setState(next);
              if (Array.isArray(next.providers)) setProviders(next.providers);
              return next as unknown as Record<string, unknown>;
            } catch (error) {
              setState(null);
              throw error;
            }
          }),
        ],
        capabilities,
      );
      runtime.events.subscribe((event) => addNotice(event.message));
      runtimeRef.current = runtime;
    }
    return runtimeRef.current;
  }, [addNotice]);

  const refreshState = useCallback(async () => {
    const snap = await getRuntime().cycle();
    setSnapshot(snap);
    snapshotRef.current = snap;
    setHeroState(snap.state);
    setConnectionStatus(snap.controlPlaneReachable ? snap.state : "BACKEND OFFLINE");
    setStatusMode(
      snap.state === "PROTECTED" ? "protected" : snap.state === "OFFLINE" || snap.state === "EXPOSED" ? "danger" : "normal",
    );
    if (!snap.controlPlaneReachable) return;
    try {
      const result = await aegisApi<{ providers?: AegisProvider[] } | AegisProvider[]>(
        AEGIS_ENDPOINTS.providers,
      );
      setProviders(Array.isArray(result) ? result : result.providers || []);
    } catch {
      /* provider endpoint unavailable */
    }
    await loadEvents();
  }, [getRuntime, loadEvents]);

  const findAgent = useCallback(async () => {
    setStep("LOCATING AEGIS AGENT…");
    const base = await discoverAgent();
    setAgentBase(base);
    if (base) setApiBaseValue(base);
    setStep(base ? "" : "AEGIS AGENT NOT RUNNING ON THIS DEVICE");
    await refreshState();
    return base;
  }, [refreshState]);

  const runOperation = useCallback(
    async (endpoint: string, payload: unknown, message: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);

      // The UI reflects the operation in progress, not a protected verdict.
      setHeroState(
        endpoint === AEGIS_ENDPOINTS.establish
          ? "ESTABLISHING"
          : endpoint === AEGIS_ENDPOINTS.rotate
            ? "ROTATING"
            : endpoint === AEGIS_ENDPOINTS.recover
              ? "RECOVERING"
              : "VERIFYING",
      );
      setConnectionStatus("WORKING");
      setStatusMode("normal");
      addNotice(message);

      // While the agent works, follow the steps it reports (status + events).
      const poll = setInterval(async () => {
        try {
          const s = await aegisApi<AegisState>(AEGIS_ENDPOINTS.state);
          setState(s);
          if (s.status) setStep(`AGENT: ${s.status}`);
          await loadEvents();
        } catch {
          /* agent busy */
        }
      }, 1500);

      try {
        if (!snapshotRef.current?.controlPlaneReachable) {
          const base = await discoverAgent();
          setAgentBase(base);
          if (!base) throw new Error("AEGIS agent not running on this device");
        }
        setStep("AGENT: INITIALIZING");
        await aegisApi(endpoint, {
          method: "POST",
          body: JSON.stringify(payload || {}),
        });
        setStep("AGENT: VERIFYING RESULTING STATE");
        toast("AEGIS operation accepted");
      } catch (error) {
        addNotice("AEGIS operation failed: " + (error as Error).message);
        toast("AEGIS operation failed");
      } finally {
        clearInterval(poll);
        await refreshState();
        setStep("");
        busyRef.current = false;
        setBusy(false);
      }
    },
    [addNotice, refreshState, toast, loadEvents],
  );

  function toggleProtection() {
    if (isProtected) {
      runOperation(
        AEGIS_ENDPOINTS.recover,
        { action: "disconnect" },
        "Protection boundary release requested.",
      );
    } else {
      // One tap: the agent initializes, establishes transport, configures
      // DNS/route/firewall, verifies and collects telemetry.
      runOperation(
        AEGIS_ENDPOINTS.establish,
        { operation: "EstablishTransport", verifyBeforeBind: true, autonomous: true },
        "Transport establishment requested.",
      );
    }
  }

  function rotateTransport() {
    runOperation(AEGIS_ENDPOINTS.rotate, { verifyBeforeBind: true }, "Transport rotation requested.");
  }

  function verifyTransport() {
    runOperation(AEGIS_ENDPOINTS.verify, { verifyBeforeBind: true }, "Transport verification requested.");
  }

  function saveApiBase() {
    const value = apiBase.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/i.test(value)) {
      toast("Enter a valid HTTP(S) API URL");
      return;
    }
    setApiBase(value);
    setApiBaseValue(value);
    setAgentBase(value);
    toast("AEGIS API endpoint saved");
    refreshState();
  }

  useEffect(() => {
    if (!aegisStarted) {
      // StrictMode double-mount guard: initialize once.
      aegisStarted = true;
      startedRef.current = true;
      setApiBaseValue(getApiBase());
      addNotice("AEGIS interface initialized.");
      void findAgent();
    }
    const interval = setInterval(() => {
      if (!busyRef.current) void refreshState();
    }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const identity = state?.identity || {};
  const network = state?.network || {};
  const exposure = state?.exposure || {};
  const verification = (state?.verification || {}) as Record<string, unknown>;
  const boundaryInfo = (state as unknown as { boundary?: { failClosed?: boolean | null } } | null)?.boundary;
  const failClosedText =
    boundaryInfo?.failClosed === true ? "ENABLED" : boundaryInfo?.failClosed === false ? "FAIL: DISABLED" : "UNKNOWN";

  return (
    <div className="app">
      <header className="top">
        <div className="logo">AEGIS</div>

        <div className="status">
          <span
            className={
              "status-dot" + (statusMode === "protected" ? " protected" : statusMode === "danger" ? " danger" : "")
            }
          />
          <span>{connectionStatus}</span>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="hero-label">NETWORK BOUNDARY</div>

          <div className="hero-state">{heroState}</div>

          <div className="hero-ip">
            {state ? text(identity.ipv4 ?? "identity unavailable") : "discovering external identity..."}
          </div>

          <div className="hero-step">{step}</div>

          <button
            className={"connect" + (isProtected ? " active" : "")}
            onClick={toggleProtection}
            disabled={busy}
          >
            <strong>{isProtected ? "DISCONNECT" : "CONNECT"}</strong>
            <small>{isProtected ? "PROTECTED" : "AEGIS"}</small>
          </button>
        </section>

        {/* IDENTITY / NETWORK */}
        <div className="grid">
          <section className="card">
            <h3>Public Identity</h3>

            <div className="row">
              <span className="label">IPv4</span>
              <span className="value">{text(identity.ipv4)}</span>
            </div>

            <div className="row">
              <span className="label">IPv6</span>
              <span className="value">{text(identity.ipv6)}</span>
            </div>

            <div className="row">
              <span className="label">ASN</span>
              <span className="value">{text(identity.asn)}</span>
            </div>

            <div className="row">
              <span className="label">Provider</span>
              <span className="value">{text(identity.provider)}</span>
            </div>

            <div className="row">
              <span className="label">Location</span>
              <span className="value">{text(identity.location)}</span>
            </div>
          </section>

          <section className="card">
            <h3>Network Path</h3>

            <div className="row">
              <span className="label">Interface</span>
              <span className="value">{text(network.interface)}</span>
            </div>

            <div className="row">
              <span className="label">Local IPv4</span>
              <span className="value">{text(network.localIpv4)}</span>
            </div>

            <div className="row">
              <span className="label">Gateway</span>
              <span className="value">{text(network.gateway)}</span>
            </div>

            <div className="row">
              <span className="label">DNS</span>
              <span className="value">{text(network.dns)}</span>
            </div>

            <div className="row">
              <span className="label">Route</span>
              <span className="value">{text(network.route)}</span>
            </div>
          </section>
        </div>

        {/* EXPOSURE */}
        <section className="card section">
          <h3>Network Exposure</h3>

          <div className="exposure">
            {[
              {
                key: "ipv4",
                label: "IPv4",
                caption: "Public identity exposure",
                on: "IPv4 PROTECTED",
                off: "IPv4 EXPOSED",
              },
              {
                key: "ipv6",
                label: "IPv6",
                caption: "IPv6 boundary",
                on: "IPv6 PROTECTED",
                off: "IPv6 EXPOSED",
              },
              {
                key: "dns",
                label: "DNS",
                caption: "DNS path exposure",
                on: "DNS PROTECTED",
                off: "DNS EXPOSED",
              },
              {
                key: "webrtc",
                label: "WebRTC",
                caption: "Application leak surface",
                on: "WebRTC PROTECTED",
                off: "WebRTC POTENTIAL",
              },
              {
                key: "route",
                label: "ROUTE",
                caption: "Direct routing",
                on: "ROUTE PROTECTED",
                off: "DIRECT ROUTE",
              },
              {
                key: "transport",
                label: "TRANSPORT",
                caption: "Privacy transport",
                on: "TRANSPORT VERIFIED",
                off: "NO VERIFIED TRANSPORT",
              },
            ].map((item) => {
              const label = exposureLabel(item.label, exposure[item.key], item.on, item.off);
              return (
                <div className="exposure-item" key={item.key}>
                  <b className={resultClass(label).replace("value", "").trim()}>{label}</b>
                  <span>{item.caption}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* TRANSPORT */}
        <section className="card section">
          <h3>Transport Fabric</h3>

          <div>
            {providers === null ? (
              <div className="transport">Awaiting transport provider registry.</div>
            ) : providers.length === 0 ? (
              <div className="transport">No transport providers reported.</div>
            ) : (
              providers.map((provider, index) => {
                const active = provider.Active === true;
                const verified = provider.Verified === true;
                const available = provider.Available === true;

                const pill =
                  active && verified ? "ACTIVE" : available ? "AVAILABLE" : "UNAVAILABLE";

                return (
                  <div className="transport" key={provider.Id || provider.Provider || index}>
                    <div>
                      <div className="transport-name">{provider.Provider ?? "Unknown"}</div>
                      <div className="transport-meta">{provider.Type ?? "Transport"}</div>
                    </div>
                    <span className={"pill" + (pill === "ACTIVE" ? " active" : "")}>{pill}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* VERIFICATION / AUTOPILOT */}
        <div className="grid section">
          <section className="card">
            <h3>Verification Fabric</h3>

            {[
              { label: "External endpoint", key: "externalEndpoint" },
              { label: "Route binding", key: "routeBinding" },
              { label: "DNS path", key: "dnsPath" },
              { label: "IPv6 boundary", key: "ipv6Boundary" },
              { label: "Provider", key: "provider" },
            ].map((item) => {
              const value = proofValue(verification, item.key);
              return (
                <div className="row" key={item.key}>
                  <span className="label">{item.label}</span>
                  <span className={resultClass(value)}>{value}</span>
                </div>
              );
            })}
          </section>

          <section className="card">
            <h3>Autopilot</h3>

            <div className="row">
              <span className="label">Automatic rotation</span>
              <span className={resultClass(state ? "READY" : "PENDING")}>
                {state ? "READY" : "PENDING"}
              </span>
            </div>

            <div className="row">
              <span className="label">Verify before bind</span>
              <span className="value good">ENABLED</span>
            </div>

            <div className="row">
              <span className="label">Fail closed</span>
              <span className={resultClass(failClosedText)}>{failClosedText}</span>
            </div>

            <div className="row">
              <span className="label">Background monitoring</span>
              <span className={resultClass(state ? "READY" : "PENDING")}>
                {state ? "READY" : "PENDING"}
              </span>
            </div>

            <div className="actions">
              <button className="action" onClick={rotateTransport} disabled={busy}>
                ROTATE
              </button>

              <button className="action" onClick={verifyTransport} disabled={busy}>
                VERIFY
              </button>

              <button className="action" onClick={() => refreshState()} disabled={busy}>
                REFRESH
              </button>
            </div>
          </section>
        </div>

        {/* EVENTS */}
        <section className="card section">
          <h3>AEGIS Event Stream</h3>

          <div>
            {events.map((item) => (
              <div className="event" key={item.key}>
                <span className="event-time">{item.time}</span>
                <span className="event-text">{item.message}</span>
              </div>
            ))}
          </div>
        </section>

        {/* BACKEND CONFIG — advanced; the agent is discovered automatically */}
        <details className="advanced">
          <summary>ADVANCED · AGENT {agentBase ? `@ ${agentBase}` : "NOT FOUND"}</summary>
          <section className="config">
            <input
              type="url"
              spellCheck={false}
              placeholder="http://127.0.0.1:8787"
              value={apiBase}
              onChange={(event) => setApiBaseValue(event.target.value)}
            />

            <button onClick={saveApiBase}>SAVE API</button>
            <button onClick={() => void findAgent()}>DISCOVER</button>
          </section>
        </details>
      </main>

      <div className="toast" style={{ display: toastMessage ? "block" : "none" }}>
        {toastMessage}
      </div>
    </div>
  );
}
