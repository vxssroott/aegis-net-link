/** AEGIS Core — local event bus. Events describe real runtime activity only. */

export type AegisEventSeverity = "INFO" | "WARN" | "ERROR";

export interface AegisEvent {
  id: string;
  timestamp: string;
  category: "STATE" | "OBSERVATION" | "POLICY" | "VERIFICATION" | "OPERATOR" | "RUNTIME";
  severity: AegisEventSeverity;
  message: string;
  evidenceId?: string | undefined;
}

let seq = 0;

export class AegisEventBus {
  private readonly buffer: AegisEvent[] = [];
  private readonly listeners = new Set<(event: AegisEvent) => void>();

  constructor(private readonly limit = 100) {}

  publish(
    category: AegisEvent["category"],
    severity: AegisEventSeverity,
    message: string,
    evidenceId?: string,
  ): AegisEvent {
    seq += 1;
    const event: AegisEvent = {
      id: `evt_${Date.now()}_${seq}`,
      timestamp: new Date().toISOString(),
      category,
      severity,
      message,
      evidenceId,
    };
    this.buffer.unshift(event);
    if (this.buffer.length > this.limit) this.buffer.length = this.limit;
    for (const listener of this.listeners) listener(event);
    return event;
  }

  recent(count = 20): AegisEvent[] {
    return this.buffer.slice(0, count);
  }

  subscribe(listener: (event: AegisEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
