# AEGIS Mobile Agent Protocol (v1)

The browser dashboard drives any agent that implements this. The Windows
control plane (`Aegis.ControlApi.ps1`) already does; an Android
(`VpnService`) or iOS (`NEPacketTunnelProvider`) agent must implement the same.

## Reachability
- Listen on `http://127.0.0.1:8787` (loopback) on the phone. The dashboard,
  opened in the phone's browser, auto-probes `127.0.0.1`, `localhost`, `[::1]` on 8787.
- Reaching a phone from another device requires HTTPS with a trusted cert
  (browsers block http:// LAN calls from an https page); enter that URL under ADVANCED.
- CORS: `Access-Control-Allow-Origin: <dashboard origin>`,
  `Access-Control-Allow-Private-Network: true` on preflight, allow `Content-Type`.

## Endpoints (JSON)
| Method | Path | Behaviour |
|---|---|---|
| GET | /network/state | Current authoritative state (below) |
| GET | /transport/providers | `{ providers: [{Id,Provider,Type,Available,Active,Verified}] }` |
| POST | /transport/establish | Start protection; return immediately or when done. Progress via `status` |
| POST | /transport/verify | Re-run verification, update `verification` |
| POST | /transport/rotate | Switch egress, re-verify |
| POST | /transport/recover | Body `{action:"disconnect"}` tears down the tunnel |
| GET | /events | `{ events: [{id,timestamp,type,severity,message}] }` (oldest first) |

## /network/state
```json
{
  "status": "INITIALIZING|PROTECTING|VERIFYING|PROTECTED|UNPROTECTED|ERROR|OBSERVING",
  "identity": { "ipv4": null, "ipv6": null, "asn": null, "provider": null, "location": null },
  "network":  { "interface": null, "localIpv4": null, "gateway": null, "dns": null, "route": null },
  "exposure": { "ipv4": null, "ipv6": null, "dns": null, "route": null, "webrtc": null },
  "transport": { "activeId": null, "verified": false },
  "verification": { "status": "PENDING|VERIFIED|FAILED",
    "externalEndpoint": null, "routeBinding": null, "dnsPath": null, "ipv6Boundary": null, "provider": null },
  "boundary": { "failClosed": null, "directEgressBlocked": null }
}
```
Rules: unknown = `null`, never a guess. Booleans in `exposure`/`boundary`/proofs:
`true` = inside boundary / pass. On Android, `failClosed` = Always-on VPN +
"Block connections without VPN" enabled; on iOS, `includeAllNetworks` active.

## How the dashboard decides PROTECTED
Only when the agent reports every proof `true`, `transport.verified: true`,
`boundary.failClosed: true`, `directEgressBlocked: true`, and IPv4/IPv6/DNS/route
inside the boundary. Any `false` → EXPOSED/DEGRADED; any `null` → not PROTECTED.
