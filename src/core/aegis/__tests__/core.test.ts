import { describe, expect, it } from "vitest";
import { AegisStateMachine, IllegalTransitionError } from "../state";
import { AegisCoreRuntime, decide, legalPath } from "../runtime";
import { connectivitySource, controlPlaneSource, normalizeControlPlaneState } from "../sources";
import { CapabilityManager } from "../capability";
import { defaultPolicy, evaluatePolicy } from "../policy";
import { emptyBoundary } from "../boundary";
import { ObservationStore, UNKNOWN } from "../observation";
import { nullOperator } from "../operator";
import { evaluateEgress, unknownEgress } from "../egress";

const granted = () => {
  const c = new CapabilityManager();
  c.set("NETWORK_STATE_OBSERVATION", "GRANTED");
  return c;
};

const fullyVerified = {
  status: "PROTECTED",
  exposure: { ipv4: true, ipv6: true, dns: true, route: true },
  boundary: { failClosed: true, directEgressBlocked: true },
  transport: { activeProvider: "wg0", verified: true },
  verification: { status: "VERIFIED", externalEndpoint: true, routeBinding: true, dnsPath: true, ipv6Boundary: true, provider: true },
};

describe("state machine", () => {
  it("rejects illegal transitions", () => {
    const m = new AegisStateMachine();
    expect(() => m.transition("PROTECTED", "x")).toThrow(IllegalTransitionError);
  });
  it("finds legal paths", () => {
    expect(legalPath("INITIALIZING", "PROTECTED")).toEqual(["OBSERVING", "VERIFYING", "PROTECTED"]);
  });
});

describe("observations", () => {
  it("maps missing values to UNKNOWN with NONE confidence", () => {
    const obs = normalizeControlPlaneState({});
    const ip = obs.find((o) => o.key === "egress.ipv4")!;
    expect(ip.value).toBe(UNKNOWN);
    expect(ip.confidence).toBe("NONE");
  });
});

describe("policy", () => {
  it("is INDETERMINATE on an unobserved boundary, never CONFORMANT", () => {
    const v = evaluatePolicy(defaultPolicy(), { observations: new ObservationStore(), boundary: emptyBoundary() });
    expect(v.verdict).toBe("INDETERMINATE");
  });
});

describe("egress", () => {
  it("does not verify without observations", () => {
    expect(evaluateEgress(unknownEgress(), { transport: "WIREGUARD" }, 0)).toBe("NOT_VERIFIED");
  });
});

describe("operator", () => {
  it("null operator never applies anything", async () => {
    expect((await nullOperator.execute({ operation: "FIREWALL_APPLY_FAIL_CLOSED" })).outcome).toBe("UNAVAILABLE");
  });
});

describe("runtime", () => {
  it("goes OFFLINE when control plane unreachable", async () => {
    const rt = new AegisCoreRuntime([controlPlaneSource(async () => { throw new Error("down"); })], granted());
    expect((await rt.cycle()).state).toBe("OFFLINE");
  });
  it("skips sources whose capability is not granted", async () => {
    const rt = new AegisCoreRuntime([controlPlaneSource(async () => fullyVerified)], new CapabilityManager());
    expect((await rt.cycle()).state).toBe("OFFLINE");
  });
  it("does not claim PROTECTED from a status string alone", async () => {
    const rt = new AegisCoreRuntime([controlPlaneSource(async () => ({ status: "PROTECTED" }))], granted());
    expect((await rt.cycle()).state).not.toBe("PROTECTED");
  });
  it("reaches PROTECTED only with full evidence, via legal transitions", async () => {
    const rt = new AegisCoreRuntime([connectivitySource(() => true), controlPlaneSource(async () => fullyVerified)], granted());
    const snap = await rt.cycle();
    expect(snap.state).toBe("PROTECTED");
    expect(snap.evidence?.claim).toBe("PROTECTED");
    expect(snap.history.map((t) => t.to)).toEqual(["OBSERVING", "VERIFYING", "PROTECTED"]);
  });
  it("a failed proof yields DEGRADED, not PROTECTED", async () => {
    const s = { ...fullyVerified, verification: { ...fullyVerified.verification, dnsPath: false } };
    const rt = new AegisCoreRuntime([controlPlaneSource(async () => s)], granted());
    expect((await rt.cycle()).state).toBe("DEGRADED");
  });
  it("decide reports EXPOSED without transport on failure", () => {
    const d = decide({
      online: true, controlPlaneReachable: true, controlPlaneStatus: "OBSERVING", transportActive: false,
      policy: { policyId: "p", verdict: "NON_CONFORMANT", results: [{ ruleId: "r", status: "FAIL", reason: "", observationIds: [] }], timestamp: "" },
      verification: "INCONCLUSIVE", results: [],
    });
    expect(d.state).toBe("EXPOSED");
  });
});
