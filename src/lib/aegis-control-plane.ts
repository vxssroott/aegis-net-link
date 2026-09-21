/**
 * AEGIS control-plane client.
 *
 * The browser never performs privileged network operations. It only speaks to
 * the AEGIS Control API (control-plane/Aegis.ControlApi.ps1), which delegates
 * to the existing AEGIS network/platform/provider abstractions.
 */

export const AEGIS_ENDPOINTS = {
  state: "/network/state",
  providers: "/transport/providers",
  establish: "/transport/establish",
  verify: "/transport/verify",
  rotate: "/transport/rotate",
  recover: "/transport/recover",
  events: "/events",
} as const;

const STORAGE_KEY = "aegis_api_base";

export const DEFAULT_API_BASE = "http://127.0.0.1:8787";

export function getApiBase(): string {
  if (typeof localStorage === "undefined") return DEFAULT_API_BASE;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE;
}

export function setApiBase(value: string): void {
  localStorage.setItem(STORAGE_KEY, value);
}

function apiUrl(path: string): string {
  return getApiBase().replace(/\/+$/, "") + path;
}

export async function aegisApi<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const raw = await response.text();
    let body: unknown = raw;

    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* response was not JSON */
    }

    if (!response.ok) {
      const message =
        typeof body === "object" && body && "message" in body
          ? String((body as { message: unknown }).message)
          : `AEGIS API ${response.status}`;
      throw new Error(message);
    }

    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

/* ---------------------------------------------------------------- types */

export interface AegisProvider {
  Id?: string | null;
  Provider?: string | null;
  Type?: string | null;
  Available?: boolean | null;
  Active?: boolean | null;
  Verified?: boolean | null;
}

export interface AegisEvent {
  id?: string;
  timestamp?: string;
  type?: string;
  category?: string;
  severity?: string;
  message?: string;
}

export interface AegisState {
  status?: string;
  identity?: {
    ipv4?: string | null;
    ipv6?: string | null;
    asn?: string | null;
    provider?: string | null;
    location?: string | null;
  };
  network?: {
    interface?: string | null;
    localIpv4?: string | null;
    gateway?: string | null;
    dns?: string | null;
    route?: string | null;
  };
  exposure?: Record<string, boolean | null>;
  verification?: Record<string, unknown> & { status?: string };
  transport?: { state?: string; verified?: boolean; activeId?: string | null };
  providers?: AegisProvider[];
}
