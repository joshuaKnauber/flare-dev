---
name: flare-dev
description: Apply visual changes from the Flare browser inspector to source code. Use this skill whenever Flare pushes style changes or content comments to apply to the codebase. Trigger when the user mentions Flare, visual CSS editing, browser-to-code workflow, or when you receive a watch.batch event from `npx flare-dev watch`. Also use this skill proactively to start the Flare bridge when working on frontend projects where the user might want to make visual edits.
---

# Flare — Visual CSS Editor Bridge

Flare is a browser-based visual CSS inspector. The user makes style changes and content comments directly in the browser, and your job is to apply them to the source code.

## How Flare works

Flare runs as an overlay on the user's dev server. It has two modes:

**Panel mode** — The user selects an element on the live page, tweaks CSS properties (colors, spacing, layout, typography), and pushes the changes to you. You receive a structured diff of what changed (property, before value, after value) along with the element's CSS selector, DOM path, and source file location when available.

**Canvas mode** — The user steps outside the page to compare multiple versions side-by-side on an infinite canvas. They can duplicate frames, make different edits in each, and push the version they want. Comments in canvas mode describe content or structural changes (like "change this headline to 'Ship faster'") and include the element's current HTML for context.

## Setup

### 1. Ensure flare-dev is installed

Check if `flare-dev` is in the project's devDependencies. If not:

```bash
npm install -D flare-dev
```

For Vite projects, add the plugin to `vite.config.ts`:

```ts
import flare from "flare-dev/vite";

export default defineConfig({
  plugins: [flare()],
});
```

For non-Vite projects, add the script tag conditionally so it only loads in development:

```html
<script>
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/flare-dev/dist/flare.js';
    document.body.appendChild(s);
  }
</script>
```

If the project uses environment variables (e.g., Next.js, Astro), prefer that:

```jsx
{process.env.NODE_ENV === 'development' && (
  <script src="https://unpkg.com/flare-dev/dist/flare.js" />
)}
```

Never ship Flare to production — it's a dev tool only.

### 2. Start the bridge

The bridge is a lightweight local HTTP server that Flare uses to send you changes. Check if it's already running:

```bash
curl -s http://127.0.0.1:4318/health
```

If it's not running, start it in the background:

```bash
npx flare-dev bridge &
```

### 3. Listen for changes

Run the watcher for the user's dev server origin. This blocks until Flare pushes changes, prints one JSON batch to stdout, then exits:

```bash
npx flare-dev watch --origin "http://localhost:5173"
```

Adjust the port to match the user's dev server. Common ports: 5173 (Vite), 3000 (Next.js/CRA), 4321 (Astro), 8080 (various).

## Processing a watch.batch event

The watcher outputs a single JSON line:

```json
{
  "type": "watch.batch",
  "inboxPath": "/path/to/inbox",
  "files": [
    {
      "filePath": "/path/to/inbox/1234.json",
      "payload": {
        "origin": "http://localhost:5173",
        "snapshot": {
          "updatedAt": "2026-04-11T...",
          "changes": [...]
        }
      }
    }
  ]
}
```

For each file in the batch:

### Style changes

Each change entry looks like:

```json
{
  "selector": ".hero-title",
  "path": "section > div > h1.hero-title",
  "textSnippet": "Build better products",
  "source": "src/components/Hero.tsx:12:4",
  "comment": "optional user note",
  "changes": [
    { "property": "font-size", "before": "48px", "after": "64px" },
    { "property": "color", "before": "rgb(0, 0, 0)", "after": "rgb(30, 64, 175)" }
  ]
}
```

**How to apply style changes:**

- The `source` field tells you the exact file and line. Start there.
- The `selector` and `path` help identify the element if `source` is missing.
- Don't translate CSS literally. Use the project's idiom:
  - **Tailwind**: Update utility classes (`text-5xl` → `text-6xl`, `text-black` → `text-blue-800`)
  - **CSS Modules / vanilla CSS**: Update the class definition in the stylesheet
  - **Styled-components / Emotion**: Update the template literal styles
  - **Inline styles / style props**: Update the JSX style object
- If the element comes from a reusable component, update the component's internal styles — not the call site.
- If a design token or CSS variable exists for the value (e.g., `--color-primary`), use that instead of a raw value.
- The `before` value helps you find the right property to change. Search for it in the source.

### Content comments (canvas mode)

When `changes` is empty but `comment` is present, the user is describing a content or structural change from canvas mode. The comment includes the element's current HTML:

```json
{
  "selector": "h1.hero-title",
  "path": "h1.hero-title",
  "textSnippet": "Build better products",
  "comment": "Change this to 'Ship faster'\n\nCurrent element HTML:\n<h1 class=\"hero-title\">Build better products</h1>",
  "changes": []
}
```

**Important: Comments modify the frame, not the source code.** The user is exploring changes in the canvas — these aren't final yet. Instead of editing source files, send the modified HTML back to Flare so it can update the iframe in-place:

```bash
curl -X POST http://127.0.0.1:4318/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "http://localhost:5173",
    "selector": "h1.hero-title",
    "outerHTML": "<h1 class=\"hero-title\">Ship faster</h1>"
  }'
```

The response fields:
- `origin` — the app origin (same as in the push request)
- `selector` — CSS selector to find the element in the iframe
- `outerHTML` — the complete replacement HTML for that element

Flare will pick up the response and replace the element's `outerHTML` in the canvas frame. The user can then compare versions and eventually push the frame's style changes to source when they're ready.

Do NOT modify source files for content comments. Only style change pushes (entries with non-empty `changes` arrays) should be applied to source.

### After applying

Delete each processed inbox file to prevent re-processing:

```bash
rm "/path/to/inbox/1234.json"
```

Then run the watcher again to wait for the next batch:

```bash
npx flare-dev watch --origin "http://localhost:5173"
```

Keep this loop running for as long as the user is working with Flare.

## Continuous workflow

The ideal workflow is a loop:

1. Start the bridge (if not running)
2. Run the watcher (blocks until changes arrive)
3. Apply the changes to source
4. Delete the processed files
5. Go to step 2

The user's dev server will hot-reload with your changes, and they'll see the results immediately in the browser. They may then push more changes — the watcher picks those up in the next iteration.

## Tips

- When multiple elements are changed in one batch, apply them all before moving to the next batch. They often relate to each other (e.g., a heading size change + spacing adjustment).
- The `textSnippet` is the visible text content of the element — use it to disambiguate when selectors are generic.
- Comments from canvas mode are higher-level instructions. The user is exploring design directions, so apply them thoughtfully rather than mechanically.
- If you're unsure which file to edit, search the codebase for the `textSnippet` or the `selector` class name.
