import { it, expect } from "vitest";
import { decide } from "../runtime";
const base = { online: true, controlPlaneReachable: true, transportActive: false,
  policy: { verdict: "CONFORMANT", results: [] } as any, verification: "VERIFIED" as any, results: [] };
it("states", () => {
  expect(decide({ ...base, controlPlaneReachable: false, controlPlaneStatus: "" }).state).toBe("OFFLINE");
  for (const s of ["INITIALIZING","PROTECTING"]) expect(decide({ ...base, controlPlaneStatus: s }).state).toBe("CONNECTING");
  expect(decide({ ...base, controlPlaneStatus: "VERIFYING" }).state).toBe("VERIFYING");
  expect(decide({ ...base, controlPlaneStatus: "ERROR" }).state).toBe("EXPOSED");
  expect(decide({ ...base, controlPlaneStatus: "PROTECTED", verification: "UNKNOWN" as any }).state).toBe("READY");
  expect(decide({ ...base, controlPlaneStatus: "PROTECTED" }).state).toBe("PROTECTED");
});
