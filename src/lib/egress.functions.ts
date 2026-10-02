import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * AEGIS Core external egress observer (runs on the AEGIS server, not the browser).
 * Reports the public address the request actually arrived from, plus network
 * metadata the edge attaches. Nothing is guessed: missing fields are null.
 */
export const observeEgress = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const h = req.headers;
  const ip =
    h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const cf = ((req as unknown as { cf?: Record<string, unknown> }).cf ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);
  return {
    ip,
    family: ip ? (ip.includes(":") ? "ipv6" : "ipv4") : null,
    asn: str(cf["asn"]),
    asOrganization: str(cf["asOrganization"]),
    country: str(cf["country"]) ?? h.get("cf-ipcountry"),
    region: str(cf["region"]),
    edge: str(cf["colo"]),
    observedAt: new Date().toISOString(),
    source: ip ? "server:request-headers" : null,
  };
});
