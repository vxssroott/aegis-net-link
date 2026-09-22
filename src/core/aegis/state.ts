/**
 * AEGIS Core — authoritative state machine.
 *
 * The UI never invents these values. Only AegisCoreRuntime may perform a
 * transition, and only along an edge declared in TRANSITIONS.
 */

export const AEGIS_STATES = [
  "INITIALIZING",
  "OBSERVING",
  "READY",
  "CONNECTING",
  "CONNECTED",
  "VERIFYING",
  "PROTECTED",
  "DEGRADED",
  "EXPOSED",
  "UNKNOWN",
  "REMEDIATING",
  "RECOVERING",
  "OFFLINE",
] as const;

export type AegisState = (typeof AEGIS_STATES)[number];

/**
 * Semantic ladder used across the product. These are NOT interchangeable:
 * a CONFIGURED transport is not CONNECTED, and a CONNECTED transport is not
 * VERIFIED. PROTECTED requires evidence, never a button press.
 */
export const ASSURANCE_LEVELS = [
  "OBSERVED",
  "CONFIGURED",
  "CONNECTED",
  "VERIFIED",
  "PROTECTED",
  "UNKNOWN",
  "DEGRADED",
  "EXPOSED",
] as const;

export type AssuranceLevel = (typeof ASSURANCE_LEVELS)[number];

export type TransitionReason = string;

export interface StateTransition {
  from: AegisState;
  to: AegisState;
  reason: TransitionReason;
  /** Evidence record id that justifies the transition, when one exists. */
  evidenceId?: string | undefined;
  timestamp: string;
}

/** Explicit transition table. Anything absent here is illegal. */
export const TRANSITIONS: Readonly<Record<AegisState, readonly AegisState[]>> = {
  INITIALIZING: ["OBSERVING", "OFFLINE", "UNKNOWN"],
  OBSERVING: ["READY", "DEGRADED", "EXPOSED", "UNKNOWN", "OFFLINE", "VERIFYING"],
  READY: ["CONNECTING", "OBSERVING", "UNKNOWN", "OFFLINE", "DEGRADED", "EXPOSED"],
  CONNECTING: ["CONNECTED", "DEGRADED", "EXPOSED", "RECOVERING", "UNKNOWN", "OFFLINE"],
  CONNECTED: ["VERIFYING", "DEGRADED", "EXPOSED", "RECOVERING", "UNKNOWN", "OFFLINE"],
  VERIFYING: ["PROTECTED", "DEGRADED", "EXPOSED", "UNKNOWN", "REMEDIATING", "OFFLINE", "OBSERVING"],
  PROTECTED: ["VERIFYING", "DEGRADED", "EXPOSED", "RECOVERING", "UNKNOWN", "OFFLINE"],
  DEGRADED: ["VERIFYING", "REMEDIATING", "RECOVERING", "OBSERVING", "EXPOSED", "UNKNOWN", "OFFLINE"],
  EXPOSED: ["REMEDIATING", "RECOVERING", "OBSERVING", "VERIFYING", "UNKNOWN", "OFFLINE"],
  UNKNOWN: ["OBSERVING", "VERIFYING", "OFFLINE", "DEGRADED", "EXPOSED", "READY"],
  REMEDIATING: ["VERIFYING", "RECOVERING", "DEGRADED", "EXPOSED", "UNKNOWN", "OFFLINE"],
  RECOVERING: ["OBSERVING", "READY", "DEGRADED", "EXPOSED", "UNKNOWN", "OFFLINE"],
  OFFLINE: ["OBSERVING", "UNKNOWN", "DEGRADED", "EXPOSED", "RECOVERING"],
};

export function canTransition(from: AegisState, to: AegisState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: AegisState,
    readonly to: AegisState,
  ) {
    super(`Illegal AEGIS state transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export class AegisStateMachine {
  private current: AegisState;
  private readonly log: StateTransition[] = [];

  constructor(initial: AegisState = "INITIALIZING") {
    this.current = initial;
  }

  get state(): AegisState {
    return this.current;
  }

  get history(): readonly StateTransition[] {
    return this.log;
  }

  transition(to: AegisState, reason: TransitionReason, evidenceId?: string): StateTransition {
    if (!canTransition(this.current, to)) {
      throw new IllegalTransitionError(this.current, to);
    }

    const record: StateTransition = {
      from: this.current,
      to,
      reason,
      evidenceId,
      timestamp: new Date().toISOString(),
    };

    this.current = to;
    this.log.push(record);
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    return record;
  }
}
