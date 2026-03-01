import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import flare from "../../packages/flare/vite.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss(), flare()],
});
