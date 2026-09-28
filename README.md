# Aegis Connect

AEGIS — Existing Backend Integration

Use the existing AEGIS repository as the source of truth:

https://github.com/vxssroott/AEGIS

Do NOT create a new backend architecture unrelated to this repository.

Do NOT mock the backend.

Do NOT simulate network state.

Do NOT create fake transport providers.

Do NOT redesign the supplied UI.

The objective is to connect the existing AEGIS UI to the existing AEGIS control-plane architecture.

Existing AEGIS architecture

The repository contains the network/control contracts and provider implementations that the frontend must ultimately communicate with.

Relevant contracts include:

src/Network/TransportProviderContract.ps1
src/Network/TransportProviderRegistry.ps1
src/Network/PlatformContract.ps1
src/Network/AndroidTransportContract.ps1
src/Network/MobileProviderCapabilities.ps1
src/Network/AegisUiControlPlaneContract.ps1

Existing transport providers include:

Providers/WireGuardProvider.ps1
Providers/OpenVpnProvider.ps1
Providers/TorProvider.ps1
Providers/Socks5Provider.ps1
Providers/HttpConnectProvider.ps1

Use these existing abstractions.

Do not replace them with a new provider implementation merely to make the UI work.

UI → AEGIS control-plane contract

The existing UI should communicate with the AEGIS control plane through these operations:

GET /network/state

GET /transport/providers

POST /transport/establish

POST /transport/verify

POST /transport/rotate

POST /transport/recover

GET /events

These are the control-plane operations the UI needs.

If the repository already exposes these operations through another transport mechanism, adapt the frontend integration to the actual implementation rather than inventing duplicate functionality.

Network state

The UI's:

Public Identity

Network Path

Network Exposure

Verification Fabric

Transport Fabric

Network Boundary status

must be populated from actual AEGIS state.

Never hardcode these values.

Never generate placeholder values that look real.

Never display PROTECTED simply because a button was clicked.

The backend/control plane is authoritative.

CONNECT

When the user presses CONNECT:

Frontend
→ AEGIS control plane
→ transport establishment
→ actual state acquisition
→ verification
→ resulting state returned to frontend

The UI should transition through the actual operation state rather than immediately displaying PROTECTED.

DISCONNECT / RECOVERY

Use the existing AEGIS recovery/control mechanisms.

Do not implement a fake browser-side disconnect mechanism.

Privileged network operations must remain on the AEGIS backend/control plane.

VERIFY

Verification must be an actual AEGIS verification operation.

The UI must reflect the result returned by:

POST /transport/verify

A failed or inconclusive verification must NOT produce a PROTECTED UI state.

ROTATE

The existing ROTATE control must invoke:

POST /transport/rotate

and then reconcile the resulting network state.

Do not merely change displayed provider/IP information.

EVENTS

Connect the Event Stream to:

GET /events

or the repository's actual event-stream implementation if it uses another transport.

Events displayed in the UI must originate from AEGIS operations.

Do not generate fake activity merely to make the dashboard look alive.

Providers

The Transport Fabric UI must reflect the providers actually registered by:

src/Network/TransportProviderRegistry.ps1

including the existing provider implementations.

Do not invent additional providers.

UI preservation — CRITICAL

The supplied AEGIS HTML/CSS is the visual specification.

Preserve it.

Do not redesign it.

Do not replace it with a generated dashboard.

Do not add:

generic SaaS dashboard styling

excessive cards

gradients

glassmorphism

decorative AI graphics

unnecessary sidebars

new navigation systems

generic charts

redesigned typography

redesigned spacing

redesigned controls

The existing AEGIS interface should remain visually recognizable as the same interface.

Your job is to make the existing interface functional.

Backend boundary

The browser must NOT directly perform privileged system/network operations.

The browser communicates with the AEGIS control-plane API.

The AEGIS control plane communicates with the existing AEGIS network/platform/provider abstractions.

Architecture:

Browser UI
↓
AEGIS Control API
↓
AegisUiControlPlaneContract
↓
Network / Platform Contracts
↓
TransportProviderRegistry
↓
WireGuard / OpenVPN / Tor / SOCKS5 / HTTP CONNECT
↓
Actual platform/network operations

Do not bypass this architecture.

State model

Preserve the AEGIS operational principle:

Observe
→ Establish actual state
→ Verify
→ Decide
→ Enforce
→ Act
→ Verify resulting state

The frontend is a control and observation surface.

It is NOT the authority that determines whether AEGIS is protected.

Important implementation rule

First inspect the GitHub repository and determine what is already implemented.

Reuse existing AEGIS code.

Only create a thin API adapter/control surface where necessary to expose the existing functionality to the web UI.

Do not rebuild AEGIS inside Lovable.

Do not duplicate the network engine.

Do not create a second source of truth.

The final result should be:

EXISTING AEGIS ENGINE
+
EXISTING AEGIS CONTRACTS/PROVIDERS
+
THIN HTTP CONTROL/API SURFACE
+
EXISTING AEGIS UI

The UI should look the same.

The backend should be the real AEGIS backend.

The displayed state should come from actual AEGIS state.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://aegis-net-link.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4fad43db-fec5-4ca0-80ac-c6b2451a4fea).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
