/**
 * AEGIS Core Runtime — the only component allowed to change AEGIS state.
 *
 * Cycle: OBSERVE -> PROJECT BOUNDARY -> POLICY -> VERIFY -> DECIDE -> EVIDENCE -> TRANSITION.
 * PROTECTED is reachable only when policy is CONFORMANT and every verification
 * check is VERIFIED. No UI action can set a state directly.
 */

import { AegisStateMachine, TRANSITIONS, type AegisState, type StateTransition } from "./state";
import { ObservationStore, type ObservationSource } from "./observation";
import { projectBoundaryFrom, type PrivacyBoundary } from "./boundary";
import { defaultPolicy, evaluatePolicy, type AegisPolicy, type PolicyVerdict } from "./policy";
import {
  VerificationRegistry,
  controlPlaneChecks,
  summarize,
  type VerificationResult,
  type VerificationStatus,
} from "./verification";
import { EvidenceLedger, createEvidence, type EvidenceRecord } from "./evidence";
import { AegisEventBus } from "./events";
import { CapabilityManager, type Capability } from "./capability";
import { nullOperator, type PrivilegedOperator } from "./operator";

export interface RuntimeSnapshot {
  state: AegisState;
  boundary: PrivacyBoundary;
  policy: PolicyVerdict | null;
  verification: VerificationStatus;
  verificationResults: VerificationResult[];
  evidence: EvidenceRecord | null;
  controlPlaneReachable: boolean;
  operatorAvailable: boolean;
  history: readonly StateTransition[];
}

export interface Decision {
  state: AegisState;
  rationale: string;
}

/** Pure decision function — exported for tests. */
export function decide(input: {
  online: boolean | undefined;
  controlPlaneReachable: boolean;
  controlPlaneStatus: string | undefined;
  transportActive: boolean;
  policy: PolicyVerdict;
  verification: VerificationStatus;
  results: VerificationResult[];
}): Decision {
  if (input.online === false) return { state: "OFFLINE", rationale: "Device reports no connectivity." };
  if (!input.controlPlaneReachable)
    return { state: "OFFLINE", rationale: "Local AEGIS control plane is unreachable." };

  const op = (input.controlPlaneStatus ?? "").toUpperCase();
  // Agent progress states (Windows control plane + mobile agent protocol).
  if (["ESTABLISHING", "ROTATING", "CONNECTING", "INITIALIZING", "PROTECTING"].includes(op))
    return { state: "CONNECTING", rationale: `Agent: ${op}.` };
  if (op === "RECOVERING") return { state: "RECOVERING", rationale: "Agent: RECOVERING." };
  if (op === "VERIFYING") return { state: "VERIFYING", rationale: "Agent: VERIFYING." };
  if (op === "ERROR" || op === "FAILED" || op === "UNPROTECTED")
    return input.transportActive
      ? { state: "DEGRADED", rationale: `Agent reports ${op}.` }
      : { state: "EXPOSED", rationale: `Agent reports ${op}.` };

  const failed = input.results.filter((r) => r.status === "FAILED");
  const policyFail = input.policy.results.filter((r) => r.status === "FAIL");
  if (failed.length || policyFail.length) {
    const why = [...failed.map((r) => r.checkId), ...policyFail.map((r) => r.ruleId)].join(", ");
    return input.transportActive
      ? { state: "DEGRADED", rationale: `Transport active but failing: ${why}.` }
      : { state: "EXPOSED", rationale: `Direct exposure observed: ${why}.` };
  }

  if (input.verification === "VERIFIED" && input.policy.verdict === "CONFORMANT")
    return { state: "PROTECTED", rationale: "Policy conformant and all verification checks VERIFIED." };

  if (input.transportActive)
    return { state: "CONNECTED", rationale: "Transport active; verification not conclusive." };

  return { state: "READY", rationale: "Control plane reachable; no transport active; protection not verified." };
}

/** Shortest legal path through TRANSITIONS (BFS). */
export function legalPath(from: AegisState, to: AegisState): AegisState[] | null {
  if (from === to) return [];
  const prev = new Map<AegisState, AegisState>();
  const queue: AegisState[] = [from];
  const seen = new Set<AegisState>([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of TRANSITIONS[cur]) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path: AegisState[] = [to];
        let p = cur;
        while (p !== from) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export class AegisCoreRuntime {
  readonly machine = new AegisStateMachine();
  readonly observations = new ObservationStore();
  readonly verification = new VerificationRegistry();
  readonly ledger = new EvidenceLedger();
  readonly events = new AegisEventBus();
  private readonly listeners = new Set<(s: RuntimeSnapshot) => void>();
  private snap: RuntimeSnapshot;
  private running = false;

  constructor(
    private readonly sources: ObservationSource[],
    readonly capabilities: CapabilityManager = new CapabilityManager(),
    readonly operator: PrivilegedOperator = nullOperator,
    private readonly policy: AegisPolicy = defaultPolicy(),
  ) {
    this.verification.register(...controlPlaneChecks());
    this.snap = {
      state: this.machine.state,
      boundary: projectBoundaryFrom([]),
      policy: null,
      verification: "NOT_IMPLEMENTED",
      verificationResults: [],
      evidence: null,
      controlPlaneReachable: false,
      operatorAvailable: false,
      history: this.machine.history,
    };
  }

  snapshot(): RuntimeSnapshot {
    return this.snap;
  }

  subscribe(fn: (s: RuntimeSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private moveTo(target: AegisState, reason: string, evidenceId?: string): void {
    const path = legalPath(this.machine.state, target);
    if (!path) {
      this.events.publish("STATE", "ERROR", `No legal path ${this.machine.state} -> ${target}`, evidenceId);
      return;
    }
    for (const step of path) {
      const t = this.machine.transition(step, reason, evidenceId);
      this.events.publish("STATE", step === "EXPOSED" ? "WARN" : "INFO", `${t.from} → ${t.to}: ${reason}`, evidenceId);
    }
  }

  /** Run one full observe/decide cycle. */
  async cycle(): Promise<RuntimeSnapshot> {
    if (this.running) return this.snap;
    this.running = true;
    try {
      if (this.machine.state === "INITIALIZING") this.moveTo("OBSERVING", "Runtime started.");

      for (const source of this.sources) {
        const missing = this.capabilities.missing(source.requires as Capability[]);
        if (missing.length) {
          this.events.publish("OBSERVATION", "WARN", `${source.id} skipped: capability ${missing.join(", ")} not granted.`);
          continue;
        }
        this.observations.put(...(await source.collect()));
      }

      const all = this.observations.all();
      const boundary = projectBoundaryFrom(all);
      const ctx = { observations: this.observations, boundary };
      const policy = evaluatePolicy(this.policy, ctx);
      const results = await this.verification.runAll(ctx);
      const summary = summarize(results);
      const reachable = this.observations.value<boolean>("controlPlane.reachable") === true;
      const operatorAvailable = await this.operator.available();

      const decision = decide({
        online: this.observations.value<boolean>("system.online"),
        controlPlaneReachable: reachable,
        controlPlaneStatus: this.observations.value<string>("controlPlane.status"),
        transportActive: this.observations.value<string>("transport.active") !== undefined,
        policy,
        verification: summary,
        results,
      });

      const evidence = this.ledger.append(
        createEvidence({
          claim: decision.state,
          rationale: decision.rationale,
          policyVerdict: policy,
          verificationSummary: summary,
          verificationResults: results,
          observations: all,
          systemState: {
            connectivity: this.observations.value<boolean>("system.online") === false ? "OFFLINE" : "ONLINE",
            controlPlaneReachable: reachable,
            operatorAvailable,
          },
        }),
      );

      if (decision.state !== this.machine.state) this.moveTo(decision.state, decision.rationale, evidence.id);

      this.snap = {
        state: this.machine.state,
        boundary,
        policy,
        verification: summary,
        verificationResults: results,
        evidence,
        controlPlaneReachable: reachable,
        operatorAvailable,
        history: this.machine.history,
      };
      for (const l of this.listeners) l(this.snap);
      return this.snap;
    } finally {
      this.running = false;
    }
  }
}
