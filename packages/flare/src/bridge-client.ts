import type { FlareSessionSnapshot } from "./bridge-types";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4318";

interface FlareBridgeConfig {
  url?: string;
}

declare global {
  interface Window {
    __FLARE_BRIDGE__?: FlareBridgeConfig;
  }
}

function getBridgeConfig() {
  if (typeof window === "undefined") return { url: DEFAULT_BRIDGE_URL };
  return {
    url: window.__FLARE_BRIDGE__?.url ?? DEFAULT_BRIDGE_URL,
  };
}

function getCurrentOrigin() {
  if (typeof window === "undefined") return null;
  return window.location.origin ?? null;
}

export function getBridgeConnectionInfo() {
  const config = getBridgeConfig();
  return {
    configured: true,
    url: config.url,
    origin: getCurrentOrigin(),
  };
}

export async function getBridgeStatus() {
  const config = getBridgeConfig();

  try {
    const url = new URL("/health", config.url);
    const response = await fetch(url);
    return {
      available: response.ok,
    };
  } catch {
    return { available: false };
  }
}

export interface AgentDomResponse {
  origin: string;
  selector: string;
  outerHTML: string;
  variantRequestId?: string;
}

export async function pollAgentResponses(): Promise<AgentDomResponse[]> {
  const config = getBridgeConfig();
  const origin = getCurrentOrigin();
  if (!origin) return [];

  try {
    const url = new URL("/api/agent/responses", config.url);
    url.searchParams.set("origin", origin);
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as { responses?: AgentDomResponse[] };
    return data.responses ?? [];
  } catch {
    return [];
  }
}

export async function pushSnapshotToAgent(
  snapshot: FlareSessionSnapshot,
) {
  const config = getBridgeConfig();
  const origin = getCurrentOrigin();
  if (!origin) return { ok: false, inboxPath: null, filePath: null };

  try {
    const url = new URL("/api/agent/push", config.url);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin,
        snapshot,
      }),
    });

    if (!response.ok) {
      return { ok: false, inboxPath: null, filePath: null };
    }

    const data = (await response.json()) as {
      inboxPath?: string;
      filePath?: string;
    };
    return {
      ok: true,
      inboxPath: data.inboxPath ?? null,
      filePath: data.filePath ?? null,
    };
  } catch {
    return { ok: false, inboxPath: null, filePath: null };
  }
}
