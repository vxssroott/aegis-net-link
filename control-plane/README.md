# AEGIS Control API

Thin HTTP surface over the **existing** AEGIS engine
(<https://github.com/vxssroott/AEGIS>). It implements no network logic: it
dot-sources the AEGIS modules and returns their real values.

```
Browser UI
  -> AEGIS Control API (Aegis.ControlApi.ps1)
  -> AegisUiControlPlaneContract
  -> Network / Platform contracts
  -> TransportProviderRegistry
  -> WireGuard / OpenVPN / Tor / SOCKS5 / HTTP CONNECT
```

## Run it

The control plane must run on the machine AEGIS observes (privileged network
operations stay there — the browser never performs them).

```powershell
git clone https://github.com/vxssroott/AEGIS.git
# copy this folder into the clone, or point -AegisRoot at the clone
pwsh -File .\control-plane\Aegis.ControlApi.ps1 `
     -AegisRoot C:\path\to\AEGIS `
     -Prefix http://127.0.0.1:8787/
```

Then open the AEGIS UI and put `http://127.0.0.1:8787` in the API field at the
bottom of the page, and press **SAVE API**.

For access from a hosted (HTTPS) UI, put the API behind an HTTPS reverse proxy
and restrict `-AllowOrigin` to that origin.

## Operations

| Method | Path                   | AEGIS code used |
|--------|------------------------|-----------------|
| GET    | `/network/state`       | `Get-AegisTransportState`, `Get-AegisNetworkIdentity`, `Get-AegisExternalIPv4/IPv6`, `Get-AegisDnsPathVerification`, `Test-AegisNetworkLeaks`, `Get-AegisDefaultRoutes`, `Get-AegisNetworkPrivacyBoundary` |
| GET    | `/transport/providers` | `Get-AegisTransportProviderRegistry` + `Get-AegisTransportProviders` |
| POST   | `/transport/establish` | `Invoke-AegisTransportOrchestrator` then verification |
| POST   | `/transport/verify`    | `Test-AegisTransportVerification`, `Invoke-AegisPhase51ExternalVerification` primitives, `New-AegisTransportVerificationRecord` |
| POST   | `/transport/rotate`    | `Set-AegisTransportState -State Rotating` + orchestrator + verification |
| POST   | `/transport/recover`   | `Set-AegisTransportState -State Recovering` + orchestrator + verification |
| GET    | `/events`              | `Get-AegisRecentEvents` (AEGIS event bus) |

Unknown values are returned as `null`. Nothing is fabricated, and `PROTECTED`
is only reported when AEGIS transport state is verified.
