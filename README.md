# Flare

**[Try the demo →](https://tryflare.dev)**

A visual CSS inspector for designing in the browser. Edit styles visually, then copy a prompt to apply changes to your source with AI.

1. **Edit visually** — click any element, tweak layout / spacing / typography / colors
2. **Copy prompt** — Flare generates a concise CSS change description
3. **Apply with AI** — paste the prompt into Claude, Cursor, or any coding assistant

## Getting Started

### Vite Plugin (recommended)

```bash
npm install -D flare-dev
```

```ts
// vite.config.ts
import flare from "flare-dev/vite"

export default defineConfig({
  plugins: [flare()],
})
```

The plugin auto-injects Flare in dev mode only — nothing ships to production.

### Script Tag

Load on every page:

```html
<script src="https://unpkg.com/flare-dev/dist/flare.js"></script>
```

Or load only on localhost:

```html
<script>
  if (["localhost"].includes(location.hostname)) {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/flare-dev/dist/flare.js";
    document.head.appendChild(s);
  }
</script>
```

### Claude Code / AI Setup

Paste this into your AI assistant to set up Flare automatically:

```
Set up flare-dev for visual CSS editing.

If this project uses Vite:
  npm install -D flare-dev
  Then add the plugin to vite.config.ts:
    import flare from "flare-dev/vite"
    plugins: [flare()]

If not using Vite, add this script tag to the HTML to only load on localhost:
  <script>
    if (["localhost"].includes(location.hostname)) {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/flare-dev/dist/flare.js";
      document.head.appendChild(s);
    }
  </script>
```

## How It Works

Flare mounts a floating inspector panel using Shadow DOM so it won't interfere with your styles. Click any element on the page to inspect and edit its CSS properties — layout, spacing, typography, borders, shadows, and more. When you're done, hit **Copy** to get a prompt describing your changes, then paste it into your AI coding assistant to apply the edits to your source files.

## Links

- [Docs](https://flaredev.com)
- [GitHub](https://github.com/joshuaKnauber/flare-dev)
- [npm](https://www.npmjs.com/package/flare-dev)
