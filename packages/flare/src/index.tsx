import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import styles from "./styles.css?inline";

function loadFont() {
  if (document.querySelector("link[data-flare-font]")) return;

  const mono = document.createElement("link");
  mono.rel = "stylesheet";
  mono.href =
    "https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.min.css";
  mono.setAttribute("data-flare-font", "mono");
  document.head.appendChild(mono);

  const sans = document.createElement("link");
  sans.rel = "stylesheet";
  sans.href =
    "https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.min.css";
  sans.setAttribute("data-flare-font", "sans");
  document.head.appendChild(sans);
}

function mount() {
  loadFont();

  // Create host element
  const host = document.createElement("div");
  host.id = "flare-host";
  document.body.appendChild(host);

  // Attach shadow DOM for style isolation
  const shadow = host.attachShadow({ mode: "open" });

  // Inject styles into shadow root
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];

  // Create mount point inside shadow DOM
  const mountPoint = document.createElement("div");
  mountPoint.id = "flare-root";
  shadow.appendChild(mountPoint);

  // Render React, passing shadow host for theme toggling
  createRoot(mountPoint).render(
    <StrictMode>
      <App shadowHost={host} />
    </StrictMode>,
  );
}

// Mount when DOM is ready (unless hidden for this session)
const hidden = (() => {
  try {
    return sessionStorage.getItem("flare-hidden") === "true";
  } catch {
    return false;
  }
})();

if (!hidden) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
