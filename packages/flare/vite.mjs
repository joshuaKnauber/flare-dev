const SCRIPT_URL = "https://unpkg.com/flare-dev/dist/flare.js";

export default function flare() {
  return {
    name: "flare",
    apply: "serve",
    transformIndexHtml() {
      return [
        { tag: "script", attrs: { src: SCRIPT_URL }, injectTo: "body" },
      ];
    },
  };
}
