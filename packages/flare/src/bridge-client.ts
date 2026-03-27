import type { FlareSessionSnapshot } from "./bridge-types";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4318";

interface FlareBridgeConfig {
  url: string;
  projectRoot?: string;
  inboxPath: string;
}

declare global {
  interface Window {
    __FLARE_BRIDGE__?: FlareBridgeConfig;
  }
}

function getBridgeConfig() {
  if (typeof window === "undefined") return null;
  const config = window.__FLARE_BRIDGE__;
  if (!config?.url) return null;
  return config;
}

export function getBridgeConnectionInfo() {
  const config = getBridgeConfig();
  if (!config) {
    return {
      configured: false,
      url: DEFAULT_BRIDGE_URL,
      projectRoot: null,
      inboxPath: null,
    };
  }

  return {
    configured: true,
    url: config.url,
    projectRoot: config.projectRoot ?? null,
    inboxPath: config.inboxPath,
  };
}

export async function getBridgeStatus() {
  const config = getBridgeConfig();
  if (!config) return { available: false };

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

export async function pushSnapshotToAgent(
  snapshot: FlareSessionSnapshot,
) {
  const config = getBridgeConfig();
  if (!config) return { ok: false, inboxPath: null, filePath: null };

  try {
    const url = new URL("/api/agent/push", config.url);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectRoot: config.projectRoot,
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
