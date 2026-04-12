# Flare

**[Try the demo →](https://tryflare.dev)**

A visual CSS editor for designing in the browser with AI. Edit styles, explore variants, and push changes directly to your source code.

## Quick Start

Install the skill and run it in your agent:

```bash
npx skills add joshuaKnauber/flare-dev
```

```
/flare-dev
```

Works with Claude Code, Cursor, Windsurf, and any AI agent that supports skills.

## Manual Setup

The skill handles setup automatically, but if you prefer to configure manually:

### Vite Plugin

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

### Script Tag

```html
<script src="https://unpkg.com/flare-dev/dist/flare.js"></script>
```

### Bridge

Start the bridge so your agent can receive changes:

```bash
npx flare-dev bridge
```

> **Note:** The skill is still required for agent instructions — manual setup only handles the browser integration.

## How It Works

**Panel mode** — Select any element, tweak CSS properties (layout, spacing, typography, colors), and push changes to your AI agent. The agent applies them to your source code using the project's own idiom (Tailwind classes, CSS modules, styled-components, etc.).

**Canvas mode** — Step outside the page onto an infinite canvas. Duplicate frames, generate variants with AI, compare designs side-by-side, and choose the one you want. The chosen variant's component code is sent to your agent for source-level application.

## Links

- [Website](https://tryflare.dev)
- [GitHub](https://github.com/joshuaKnauber/flare-dev)
- [npm](https://www.npmjs.com/package/flare-dev)
