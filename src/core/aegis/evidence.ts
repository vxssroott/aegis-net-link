/**
 * AEGIS Core — evidence model.
 *
 * VERDICT -> POLICY RESULT -> VERIFICATION RESULT -> OBSERVATIONS -> SYSTEM STATE.
 * Every state AEGIS reports must be answerable with "why?".
 */

import type { AegisState } from "./state";
import type { PolicyVerdict } from "./policy";
import type { VerificationResult, VerificationStatus } from "./verification";
import type { Observation } from "./observation";

export interface EvidenceRecord {
  id: string;
  timestamp: string;
  /** The state AEGIS concluded, and the one-line justification. */
  claim: AegisState;
  rationale: string;
  policyVerdict: PolicyVerdict;
  verificationSummary: VerificationStatus;
  verificationResults: VerificationResult[];
  observations: Observation[];
  systemState: {
    connectivity: "ONLINE" | "OFFLINE" | "DEGRADED";
    controlPlaneReachable: boolean;
    operatorAvailable: boolean;
  };
}

let seq = 0;

export function createEvidence(input: Omit<EvidenceRecord, "id" | "timestamp">): EvidenceRecord {
  seq += 1;
  return { id: `ev_${Date.now()}_${seq}`, timestamp: new Date().toISOString(), ...input };
}

/** Bounded, local-only ledger. Nothing here leaves the device. */
export class EvidenceLedger {
  private readonly records: EvidenceRecord[] = [];

  constructor(private readonly limit = 100) {}

  append(record: EvidenceRecord): EvidenceRecord {
    this.records.unshift(record);
    if (this.records.length > this.limit) this.records.length = this.limit;
    return record;
  }

  latest(): EvidenceRecord | undefined {
    return this.records[0];
  }

  list(): readonly EvidenceRecord[] {
    return this.records;
  }

  find(id: string): EvidenceRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  /** Human-readable answer to "Why did AEGIS say X?". */
  explain(id: string): string[] {
    const record = this.find(id);
    if (!record) return ["No evidence record with that id."];

    return [
      `STATE ${record.claim} — ${record.rationale}`,
      `POLICY ${record.policyVerdict.policyId}: ${record.policyVerdict.verdict}`,
      ...record.policyVerdict.results.map((r) => `  rule ${r.ruleId}: ${r.status} (${r.reason})`),
      `VERIFICATION: ${record.verificationSummary}`,
      ...record.verificationResults.map((r) => `  ${r.checkId}: ${r.status} (${r.reason})`),
      `OBSERVATIONS: ${record.observations.length} collected`,
      `SYSTEM: connectivity ${record.systemState.connectivity}, control plane ${
        record.systemState.controlPlaneReachable ? "reachable" : "unreachable"
      }, operator ${record.systemState.operatorAvailable ? "available" : "unavailable"}`,
    ];
  }
}
