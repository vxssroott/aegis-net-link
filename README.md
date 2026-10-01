# AEGIS Net Link

<p align="center">
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

A modern, browser-based control surface for the AEGIS privacy architecture. This project does not replace the backend — it connects a real UI to the authoritative AEGIS control plane and exposes live network state, transport verification, provider telemetry, and event data from the running agent.

## Why this project exists

AEGIS is a privacy and network-boundary system with a real backend/control-plane contract. This repository provides the frontend experience that consumes that contract:

- observes network identity and boundary status
- displays transport provider health and verification evidence
- issues actual control-plane operations such as establish, verify, rotate, and recover
- auto-discovers the local AEGIS agent and binds to the correct loopback API endpoint
- keeps the UI faithful to the existing AEGIS design instead of inventing a separate dashboard pattern

At a high level, the flow is:

Browser UI
  -> AEGIS Control API
  -> AegisUiControlPlaneContract
  -> Existing AEGIS network/platform/provider abstractions
  -> Actual transport and verification operations

## Current status

This repo is an operational front-end for the AEGIS control plane, built with:

- React 19 + TypeScript
- Vite + TanStack Start
- structured AEGIS runtime and policy logic in `src/core/aegis`
- live backend client in `src/lib/aegis-control-plane.ts`
- a preserved AEGIS dashboard experience in `src/routes/index.tsx`

The app is designed to discover a local agent on `http://127.0.0.1:8787` (or the saved endpoint), then call the real AEGIS endpoints:

- `GET /network/state`
- `GET /transport/providers`
- `POST /transport/establish`
- `POST /transport/verify`
- `POST /transport/rotate`
- `POST /transport/recover`
- `GET /events`

This is intentionally a thin control surface. The browser never performs privileged system/network actions directly.

## Live app

- Production demo: https://aegis-net-link.lovable.app
- Repository: https://github.com/vxssroott/aegis-net-link
- Upstream AEGIS backend: https://github.com/vxssroott/AEGIS

## Features

### Network and boundary observation

- public identity data: IPv4, IPv6, ASN, provider, location
- network path information: interface, local IPv4, gateway, DNS, route
- exposure evaluation for IPv4/IPv6/DNS/route/transport boundaries
- verification fabric and protection-state reporting driven by AEGIS evidence

### Real control-plane actions

- connect / establish transport
- verify transport health
- rotate transport
- recover / disconnect from protected boundary
- live event stream polling from the AEGIS agent

### Agent discovery and resilience

- automatic endpoint discovery for a running local AEGIS control plane
- saved API base in browser storage
- graceful offline and unavailable-state handling without fake status fabrication

## Project structure

```text
.
├── control-plane/              # PowerShell control plane contract/adapter guidance
├── public/                     # static assets
├── src/
│   ├── core/aegis/             # runtime, policy, verification, state, sources
│   ├── lib/                   # AEGIS API client and shared types
│   ├── routes/                # TanStack route tree (app shell and dashboard)
│   ├── router.tsx
│   ├── server.ts
│   ├── start.ts
│   ├── styles.css
│   └── styles/
├── AGENTS.md
├── README.md
├── bun.lock
├── bunfig.toml
├── components.json
├── eslint.config.js
├── package.json
├── tsconfig.json
├── vite.config.ts
└── LICENSE (if present in repo)
```

## Getting started

### Prerequisites

- Node.js 20+
- npm or Bun
- a running AEGIS agent/control plane exposing the expected HTTP endpoints locally

### Install and run

```bash
git clone https://github.com/vxssroott/aegis-net-link.git
cd aegis-net-link
npm install
npm run dev
```

Then open the local Vite app and ensure the AEGIS agent is running on the expected loopback port.

### Local AEGIS control-plane setup

The control plane must run on the same machine as the protected network stack, because privileged operations remain on the backend side. The examples in this repo assume an AEGIS backend running on `http://127.0.0.1:8787`.

```powershell
git clone https://github.com/vxssroott/AEGIS.git
# point the control plane to the AEGIS root and expose it locally
pwsh -File .\control-plane\Aegis.ControlApi.ps1 `
  -AegisRoot C:\path\to\AEGIS `
  -Prefix http://127.0.0.1:8787/
```

Once the agent is available, the UI auto-discovers it and binds to the API automatically.

## Architecture

```text
Browser UI (React + TanStack)
    ↓
AEGIS Control API (PowerShell / local loopback)
    ↓
AegisUiControlPlaneContract
    ↓
AEGIS Network / Platform / Provider Contracts
    ↓
TransportProviderRegistry + Providers
    ↓
Actual transport verification and platform operations
```

This project intentionally keeps the backend authoritative. The frontend is a control/observation surface, not a second source of truth.

## Design principles

- no fake transport providers
- no simulated network state
- no hardcoded protection states
- no synthetic dashboard-only UX for network status
- no bypass of the backend/control-plane architecture
- preserve the existing AEGIS interface and operational semantics

## Development notes

The current implementation is already structured around a runtime model and policy-driven state evaluation, with logic under `src/core/aegis` for:

- observation
- state transitions
- boundary checks
- verification evidence
- operator actions
- eventing and runtime state

This is the right place to extend behavior without breaking the AEGIS contract model.

## Contributing

Contributions are welcome if they improve the end-to-end AEGIS integration without changing the control-plane semantics. Please keep the UI aligned with the existing AEGIS design and avoid fabricating backend behavior.

## License

This repository is distributed under its existing project license, if present in the repo root. Please see the repository contents for the applicable license file before publishing or distributing forks.

## Status

Production-ready UI layer for a live AEGIS control plane, with runtime discovery, state observation, provider reporting, and action execution wired to the actual backend contract.

---

Built for the AEGIS privacy control plane. Designed to remain thin, real, and operational.
