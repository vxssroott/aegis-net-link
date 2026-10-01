# AEGIS Net Link

<p align="center">
  <a href="https://github.com/vxssroott/aegis-net-link/blob/main/LICENSE" target="_blank" rel="noreferrer">
    <img src="https://img.shields.io/github/license/vxssroott/aegis-net-link?style=for-the-badge" alt="License: MIT" />
  </a>
  <a href="https://github.com/vxssroott/aegis-net-link/security" target="_blank" rel="noreferrer">
    <img src="https://img.shields.io/badge/Security-Policy-8A2BE2?style=for-the-badge&logo=shield&logoColor=white" alt="Security" />
  </a>
  <a href="https://aegis-net-link.lovable.app" target="_blank" rel="noreferrer">
    <img src="https://img.shields.io/badge/Live-Demo-0ea5e9?style=for-the-badge&logo=globe&logoColor=white" alt="Live demo" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TanStack-Start-FF6B6B?style=for-the-badge&logo=tanstack&logoColor=white" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/PowerShell-7-5391FE?style=for-the-badge&logo=powershell&logoColor=white" alt="PowerShell" />
  <img src="https://img.shields.io/badge/Lovable-Connected-FF5A5F?style=for-the-badge&logo=lovable&logoColor=white" alt="Lovable" />
</p>

A modern, browser-based control surface and observability dashboard for the **AEGIS privacy architecture**. This project provides a comprehensive operational UI that connects directly to the authoritative AEGIS control plane, enabling real-time monitoring, verification evidence visualization, and direct action dispatch across the entire privacy state and network boundary management lifecycle.

## Overview

AEGIS Net Link is a **browser-first, real-time observability and control surface** for AEGIS—a sophisticated privacy and network-boundary system. Rather than replacing or simulating the backend, this dashboard acts as a faithful, unopinionated control plane frontend that exposes the true operational state and allows operators to issue authoritative commands.

### Core Purpose

The AEGIS dashboard is the **operational control plane and source of truth for the device's privacy state**, showing:
- **what the agent observes** — network identity, boundary topology, provider health, and external surface exposure
- **what protections it applies** — active transport, verification fabric state, and rotation/recovery operations
- **what has been verified** — cryptographic and network-level evidence trails that justify the claimed security posture
- **the evidence behind the resulting security state** — detailed audit logs, verification records, and operator actions

This is not a dashboard that guesses, simulates, or synthesizes status. It is a thin, real-time window into the live AEGIS backend contract.

## Why This Project Exists

AEGIS is a real privacy and network-boundary system with a well-defined backend control-plane contract. The browser and HTTP have significant limitations—they cannot perform privileged system/network operations, nor should they pretend to. This repository bridges that gap by providing a frontend that:

- **Observes** network identity and boundary status in real time
- **Displays** transport provider health, verification evidence, and state transitions
- **Issues** actual control-plane operations such as establish, verify, rotate, and recover
- **Auto-discovers** the local AEGIS agent and binds to the correct loopback API endpoint
- **Keeps the UI faithful** to the existing AEGIS design instead of inventing a separate dashboard pattern

### The Operational Flow

```
Browser UI (React + TanStack)
    ↓
AEGIS Control API (PowerShell / local loopback)
    ↓
AegisUiControlPlaneContract
    ↓
Existing AEGIS Network / Platform / Provider abstractions
    ↓
Actual transport and verification operations
```

All privileged actions—network configuration, transport establishment, cryptographic operations, and system state modification—remain on the backend. The browser is purely an observation and dispatch surface.

## Current Status

This repository contains a production-ready operational frontend for the AEGIS control plane, built with modern web technologies and structured around a faithful runtime model and policy-driven state evaluation.

### Technology Stack

- **Frontend Framework:** React 19 + TypeScript 5.8
- **Build & Runtime:** Vite + TanStack Start (modern meta-framework)
- **UI Components:** Radix UI primitives with TailwindCSS
- **State Management:** TanStack Query (React Query) for server state
- **Forms & Validation:** react-hook-form + Zod
- **Runtime Logic:** Structured AEGIS runtime, policy logic, and state evaluation in `src/core/aegis`
- **API Client:** Live backend client in `src/lib/aegis-control-plane.ts`
- **Dashboard:** Preserved AEGIS observability experience in `src/routes/index.tsx`

### Design Architecture

The app is designed to discover a local AEGIS agent on `http://127.0.0.1:8787` (configurable and saved in browser storage), then call the following real AEGIS endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/network/state` | Retrieve current network identity, interfaces, routes, DNS, and boundary exposure |
| `GET` | `/transport/providers` | List available transport providers and their capabilities |
| `POST` | `/transport/establish` | Initiate a new protected transport connection |
| `POST` | `/transport/verify` | Perform verification fabric checks and collect evidence |
| `POST` | `/transport/rotate` | Rotate to a new transport endpoint or provider |
| `POST` | `/transport/recover` | Disconnect and recover to the unprotected state |
| `GET` | `/events` | Stream live events from the AEGIS agent and control plane |

This is intentionally a **thin control surface**. The browser never performs privileged system/network actions directly. It observes, displays evidence, and dispatches operations. The backend executes, validates, and reports back.

## Features

### Network and Boundary Observation

- **Public identity data:** IPv4, IPv6, ASN, provider, geolocation
- **Network path information:** active interface, local IPv4, gateway, DNS configuration, routing table
- **Exposure evaluation:** detailed boundary analysis for IPv4, IPv6, DNS, routes, and transport layers
- **Verification fabric:** cryptographic and operational proof that protections are active and working
- **Protection-state reporting:** driven by live AEGIS evidence, not fabrication or simulation

### Real Control-Plane Actions

- **Connect / Establish Transport:** Initiate a new protected boundary with choice of provider
- **Verify Transport Health:** Run verification checks and collect cryptographic proof
- **Rotate Transport:** Seamlessly move to a new endpoint or provider without dropping state
- **Recover / Disconnect:** Exit the protected boundary and return to the unprotected state
- **Live Event Stream:** Poll and observe the AEGIS agent event bus for operational transparency

### Agent Discovery and Resilience

- **Automatic endpoint discovery:** Detects a running local AEGIS control plane
- **Saved API base:** Browser storage persists the configured API endpoint across sessions
- **Graceful offline handling:** Distinguishes between unreachable agent and true network unavailability
- **No fake status fabrication:** Returns `null` for unknown values; never invents state

## Project Structure

```text
.
├── control-plane/              # PowerShell control plane contract/adapter guidance
│   ├── Aegis.ControlApi.ps1    # HTTP server wrapping the AEGIS backend
│   └── README.md               # Deployment and API documentation
├── public/                     # Static assets (favicon, fonts, etc.)
├── src/
│   ├── core/aegis/             # Runtime model, policy, verification, state, event sources
│   │   ├── runtime.ts          # AEGIS runtime state machine and lifecycle
│   │   ├── policy.ts           # Policy evaluation and protection logic
│   │   ├── verification.ts     # Verification evidence and fabric state
│   │   ├── state.ts            # Observable state trees and transitions
│   │   └── sources.ts          # Network and provider observation sources
│   ├── lib/
│   │   ├── aegis-control-plane.ts  # AEGIS API client and type definitions
│   │   ├── types.ts            # Shared TypeScript types for state and responses
│   │   └── utils.ts            # Shared utilities
│   ├── routes/                 # TanStack Start file-based routing
│   │   ├── __root.tsx          # App shell and layout
│   │   ├── index.tsx           # Dashboard page (main AEGIS observability UI)
│   │   ├── about.tsx           # About / information page
│   │   └── _*.tsx              # Layout routes and shared patterns
│   ├── router.tsx              # TanStack Router configuration
│   ├── server.ts               # Server-side entry point (TanStack Start)
│   ├── start.ts                # Client-side entry point
│   ├── styles.css              # Global styles
│   └── styles/                 # Modular stylesheet organization
├── AGENTS.md                   # Copilot/agent task guidance
├── README.md                   # This file
├── LICENSE                     # MIT License
├── package.json                # Node.js project manifest
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite build configuration
├── bun.lock                    # Bun lockfile (if using Bun)
├── bunfig.toml                 # Bun configuration
├── components.json             # Component library metadata
└── eslint.config.js            # ESLint configuration
```

## Getting Started

### Prerequisites

- **Node.js** 20.x or later (or Bun 1.x)
- **npm**, **yarn**, or **Bun** as your package manager
- A running **AEGIS agent/control plane** exposing the expected HTTP endpoints on the local loopback interface

### Installation and Development

```bash
# Clone the repository
git clone https://github.com/vxssroott/aegis-net-link.git
cd aegis-net-link

# Install dependencies
npm install
# or: yarn install
# or: bun install

# Start the development server
npm run dev
# or: yarn dev
# or: bun run dev
```

Then open your browser to the URL printed by Vite (typically `http://localhost:5173`) and ensure the AEGIS agent is running on the expected loopback port (`http://127.0.0.1:8787`).

### Local AEGIS Control-Plane Setup

The control plane must run on the same machine as the protected network stack, because privileged operations (transport establishment, route modification, DNS control) remain on the backend and require system-level access.

The examples in this repository assume an AEGIS backend running on Windows with PowerShell:

```powershell
# Clone the AEGIS backend repository
git clone https://github.com/vxssroott/AEGIS.git

# Run the control API adapter
pwsh -File .\control-plane\Aegis.ControlApi.ps1 `
  -AegisRoot C:\path\to\AEGIS `
  -Prefix http://127.0.0.1:8787/
```

Once the agent is available and responding on the loopback endpoint, the AEGIS Net Link UI will auto-discover it and bind to the API automatically. You can also manually enter or save the API endpoint using the configuration panel in the dashboard.

### Build for Production

```bash
npm run build
npm run preview
```

The built output is in `dist/` and can be deployed to any static hosting service or behind a reverse proxy (e.g., for HTTPS).

## Architecture

### Separation of Concerns

The architecture is built around a strict separation between the browser (observation and dispatch) and the backend (execution and state authority):

```text
Browser UI (React + TanStack Start)
    ↓ [HTTP + JSON]
AEGIS Control API (PowerShell / Windows)
    ↓ [PowerShell contract]
AegisUiControlPlaneContract
    ↓ [native AEGIS abstractions]
AEGIS Network / Platform / Provider Contracts
    ↓ [platform APIs]
TransportProviderRegistry + Providers
    ↓ [system calls]
Actual transport verification and platform operations
(WireGuard, OpenVPN, Tor, SOCKS5, HTTP CONNECT, system network APIs, etc.)
```

### Runtime Model

The `src/core/aegis` directory contains the observable runtime model:

- **Runtime:** State machine, lifecycle events, and operational sequencing
- **Policy:** Protection requirements, verification criteria, and enforcement logic
- **Verification:** Evidence collection, proof validation, and trust establishment
- **State:** Observable state trees, transitions, and event streams
- **Sources:** Network observation, provider status, and external data collection

This model is synchronized with the backend contract via polling and event streaming. The frontend never invents or simulates state; it always reflects what the backend reports.

### Client Library

`src/lib/aegis-control-plane.ts` provides a typed HTTP client that wraps the AEGIS Control API. It handles:

- Endpoint discovery and caching
- Request marshalling and response parsing
- Error handling and retry logic
- Type safety via TypeScript and Zod validation

## Design Principles

AEGIS Net Link is built on these non-negotiable principles:

1. **No fake transport providers** — every provider listed is real and available
2. **No simulated network state** — every observable is read from the backend
3. **No hardcoded protection states** — all status is computed from evidence
4. **No synthetic dashboard-only UX** — UI patterns match operational reality
5. **No bypass of the backend/control-plane architecture** — privileged operations always go through the backend
6. **Preserve the existing AEGIS interface and operational semantics** — the dashboard reflects AEGIS, not the reverse

These principles ensure that operators can trust the dashboard to show truth, not theatre.

## Development Notes

### Extending Behavior

The runtime model and policy-driven state evaluation are already structured to support extension. Logic is organized under `src/core/aegis`:

- **Add new observables:** Extend `sources.ts` with new data collection
- **Add new policy rules:** Extend `policy.ts` with new verification or enforcement criteria
- **Add new operations:** Extend the runtime state machine and add new POST endpoints to the control plane
- **Add new UI views:** Add routes under `src/routes/` that consume the observable state

### Avoiding Breaking Changes

When extending behavior, always:

- Keep the AEGIS control-plane contract intact
- Test against a live backend before committing
- Document changes in operational semantics
- Preserve backward compatibility with existing AEGIS versions

## Contributing

Contributions are welcome if they:

1. **Improve the end-to-end AEGIS integration** without changing the control-plane semantics
2. **Keep the UI aligned** with the existing AEGIS design and operational patterns
3. **Avoid fabricating or simulating state** — all observables must come from the backend
4. **Maintain type safety** — TypeScript definitions must be kept in sync with backend contracts
5. **Include tests** when adding new features or fixing bugs

Please open an issue first to discuss major changes. Pull requests should include tests and a clear description of what the change enables.

## License

This repository is distributed under the **MIT License**. See [LICENSE](LICENSE) for full details.

You are free to:
- ✅ Use this software for any purpose (commercial or personal)
- ✅ Modify and adapt the code
- ✅ Distribute copies or derivatives
- ✅ Include this software in proprietary applications

The only requirement is that you include the original copyright notice and license text in any distribution.

## Live Deployment

- **Production Demo:** https://aegis-net-link.lovable.app
- **Repository:** https://github.com/vxssroott/aegis-net-link
- **Upstream AEGIS Backend:** https://github.com/vxssroott/AEGIS

## Status

Production-ready UI layer for a live AEGIS control plane, with runtime discovery, state observation, provider reporting, and action execution wired to the actual backend contract.

---

**Built for the AEGIS privacy control plane.** Designed to remain thin, real, and operational.
