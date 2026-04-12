# flare-dev skill

A skill for AI agents that enables visual CSS editing through Flare. The agent sets up the browser integration, starts the bridge, and applies visual changes to source code.

## Install

```bash
npx skills add joshuaKnauber/flare-dev
```

## Usage

Run `/flare-dev` in your agent (Claude Code, Cursor, Windsurf, etc.). The skill handles:

- Installing `flare-dev` and configuring the browser integration (Vite plugin or script tag)
- Starting the bridge server for browser-to-agent communication
- Watching for style changes and applying them to source using the project's idiom
- Processing canvas comments and variant requests
- Rendering variant components and sending them back to the browser

## What's in SKILL.md

The skill instructions cover:

- **Setup** — detecting the project type, installing flare-dev, configuring the overlay
- **Style changes** — translating CSS property diffs to Tailwind classes, CSS modules, styled-components, etc.
- **Comments** — panel mode (apply to source) vs. canvas mode (respond with modified HTML)
- **Variants** — writing components in the project's framework, rendering to HTML, sending via the bridge
- **Element targeting** — using `data-flare-id` for reliable DOM lookup, CSS selectors for context
