# MermaidJS Desktop Client

MermaidJS Desktop Client is a cross-platform desktop editor for
[Mermaid](https://mermaid.js.org/) diagrams with real-time preview, syntax
highlighting, and SVG/PNG export. It pairs a CodeMirror-based authoring
experience with a live preview, file management helpers, and zoom controls
for both editor and preview, wrapped in a minimal Electron shell.

# Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Getting Started](#getting-started)
4. [Building](#building)
5. [Tooling](#tooling)
6. [Testing](#testing)
7. [Project Structure](#project-structure)
8. [Architecture](#architecture)
9. [Screenshots](#screenshots)
10. [Acknowledgements](#acknowledgements)

## Features

- **Live editing** – Write Mermaid syntax with syntax highlighting, line wrapping, and tab indentation.
- **Instant preview** – Debounced rendering (300 ms) keeps the preview in sync while typing, with friendly error feedback when diagrams fail to render.
- **File workflow** – New, open, and save actions integrate with the native filesystem through a typed IPC bridge. Status bar tracks unsaved changes and last saved time.
- **Recent files** – The last ten opened/saved paths are persisted and surfaced in the toolbar.
- **Command palette** – Fuzzy-searchable command surface (Ctrl/Cmd+K) driven by a central command registry, so every action is discoverable.
- **Outline view** – Lightweight Mermaid parser extracts the diagram header, subgraphs, nodes, participants, and classes to a navigable outline.
- **Mermaid theme picker** – Switch between `default`, `dark`, `forest`, and `neutral` themes; choice persists between launches.
- **Built-in examples** – Quick-start templates for flowchart, class, sequence, entity-relationship, state, gantt, and git diagrams.
- **Smart exports** – Save diagrams as PNG (1× and 2× scale) or SVG with built-in padding, white background, and automatic scaling (min 512 px for 1×, 1024 px for 2×).
- **Copy as SVG** – Copy the live preview to the clipboard as serialized SVG XML.
- **Keyboard shortcuts** – Standard shortcuts for file operations, editor zoom (Cmd/Ctrl+=/−/0), and help (F1).
- **Editor zoom** – Zoom in/out and reset the code editor font size with keyboard shortcuts.
- **Preview zoom** – Zoom diagrams with Ctrl+Scroll or toolbar controls.
- **Status counter** – Live line / column / character count in the status bar.
- **Help dialog** – Press F1 to view app info, keyboard shortcuts, and available diagram examples.
- **Resizable workspace** – Drag the divider to resize editor/preview panes or double-click to reset.
- **Window persistence** – Position, size, and maximized state persist between launches via the main-process settings store.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm 9+ (pnpm also works if you prefer; the scripts are npm-flavored)
- No Rust toolchain required — the Electron shell replaces the previous Tauri/Rust backend.
- Windows: `electron-builder` downloads the NSIS runner on the first `npm run package`; no additional setup.

## Getting Started

```bash
# Install dependencies
npm install

# Run the desktop app with live reload (Vite dev server + Electron)
npm run dev
```

For faster iteration on UI/preview features without native APIs, you can run
the frontend standalone:

```bash
npm run dev:renderer
```

and open the reported URL (typically `http://localhost:5173`) in your browser.

## Building

```bash
# Type-check and bundle the renderer + compile the Electron main/preload
npm run build

# Produce a platform-specific installer
# .exe (NSIS + Squirrel) on Windows, .dmg on macOS, .AppImage/.deb on Linux
npm run package
```

Installer output lands in `release/`.

### Code signing

By default builds are unsigned — `electron-builder` logs
`no signing info identified, signing is skipped` and Windows will show a
SmartScreen "unrecognized app" warning on install. To sign:

**Windows** (Authenticode):

```bash
CSC_LINK=/path/to/cert.pfx \
CSC_KEY_PASSWORD=your-password \
npm run package
```

`CSC_LINK` can be an absolute path or a `file:` / `https:` URL;
`electron-builder` auto-detects `.pfx`/`.p12` and signs every executable
(the app, `Update.exe`, the Squirrel stub, and the Setup).

**macOS** (Developer ID + notarization):

```bash
CSC_LINK=/path/to/cert.p12 \
CSC_KEY_PASSWORD=your-password \
APPLE_ID=you@example.com \
APPLE_APP_SPECIFIC_PASSWORD=app-specific-pwd \
APPLE_TEAM_ID=TEAMID \
npm run package
```

See [`electron-builder` code signing docs](https://www.electron.build/code-signing)
for the full option surface.

## Tooling

- `npm run clean` — Remove build artifacts (`dist/`, `dist-electron/`, `release/`)
- `npm run lint` — Run [Biome](https://biomejs.dev/) linter and formatter checks
- `npm run lint:fix` — Automatically apply Biome fixes
- `npm run typecheck` — Type-check renderer and main-process TypeScript without emitting files

## Testing

```bash
npm test               # Vitest, one-shot
npm run test:watch     # Watch mode
npm run test:coverage  # v8 coverage report to coverage/
```

Tests live under `tests/` mirroring the `src/` and `electron/` tree and run
under [happy-dom](https://github.com/capricorn86/happy-dom) for renderer code.

## Project Structure

```
mermaidjs-desktop-client/
├── src/                        # Renderer (Vite)
│   ├── main.ts                 # Bootstrap, editor init, state
│   ├── index.html              # UI shell with toolbar & workspace
│   ├── global.d.ts             # window.api type augmentation
│   ├── editor/                 # CodeMirror config & Mermaid syntax (+ counter)
│   ├── preview/                # Diagram rendering, zoom, theme, copy-svg
│   ├── toolbar/                # File ops, export handlers, examples, recent files
│   ├── palette/                # Command registry + fuzzy-search palette UI
│   ├── outline/                # Lightweight Mermaid outline parser + view
│   ├── ui/                     # Reusable primitives (dropdown, toast)
│   ├── workspace/              # Resizable pane layout
│   ├── window/                 # Editor-zoom persistence (window bounds owned by main)
│   ├── help/                   # Help dialog
│   ├── utils/                  # Debounce utility
│   └── examples/               # Built-in .mmd templates
├── electron/                   # Main process + preload (TypeScript, CJS output)
│   ├── main.ts                 # BrowserWindow, lifecycle, IPC handlers
│   ├── preload.ts              # contextBridge → window.api
│   ├── store.ts                # JSON settings store with debounced atomic writes
│   ├── types.ts                # IPC channel names + ElectronApi contract
│   └── tsconfig.json           # CommonJS build → dist-electron/
├── tests/                      # Vitest suites mirroring src/ and electron/
├── electron-builder.yml        # Installer config (Windows/Mac/Linux)
├── package.json
├── tsconfig.json               # Renderer (strict, noEmit)
├── tsconfig.node.json          # Vite config
└── vite.config.ts
```

Generated directories (`dist/`, `dist-electron/`, `release/`, `coverage/`,
`build/`) are gitignored.

## Architecture

### IPC bridge

The renderer never imports `fs`, `dialog`, `shell`, `ipcRenderer`, etc.
directly. `electron/preload.ts` exposes a typed `window.api` surface via
`contextBridge.exposeInMainWorld`. Every privileged call flows through an
IPC channel whose contract lives in `electron/types.ts`:

```
Renderer (window.api.fs.readTextFile)
  → preload (ipcRenderer.invoke)
  → main   (ipcMain.handle → fs.promises.readFile)
```

Channel names are centralized in `IPC_CHANNELS` so main and preload can't
drift. The `ElectronApi` type is the single contract: `src/global.d.ts`
imports it to augment `Window`, so the renderer gets full type-checking on
every bridge call.

### Window-state persistence

Window bounds (width / height / x / y / maximized) are persisted **entirely
in the main process** (`electron/main.ts`). On `resize` and `move`, the new
bounds are written to `{userData}/settings.json` via a debounced (400 ms)
atomic write; on `close`, the pending write is flushed immediately.

Editor zoom and Mermaid theme are persisted from the renderer via
`window.api.store.*` (same underlying JSON file). This matches the old
Tauri-Store behavior.

### Security

- Mermaid: `securityLevel: 'strict'`
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- CSP in `src/index.html`: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; script-src 'self'`
- External links rewritten through `shell.openExternal` via `setWindowOpenHandler`
- File access only through typed IPC handlers in `electron/main.ts`

## Screenshots

<p align="center">
  <img src="https://i.imgur.com/CJz8cVo.png" alt="Editor and preview workspace" width="30%" />
  <img src="https://i.imgur.com/pn6gfKd.png" alt="Example diagrams menu" width="30%" />
  <img src="https://i.imgur.com/UJt3kFq.png" alt="Export options" width="30%" />
</p>

## Acknowledgements

Built with [Electron 35](https://www.electronjs.org/),
[electron-builder 25](https://www.electron.build/),
[Vite 7](https://vitejs.dev/),
[CodeMirror 6](https://codemirror.net/6/),
[Mermaid 11](https://mermaid.js.org/),
[Vitest 4](https://vitest.dev/), and
[Biome](https://biomejs.dev/) for linting/formatting.

See [CHANGELOG.md](./CHANGELOG.md) for the Tauri → Electron migration notes and release history.
