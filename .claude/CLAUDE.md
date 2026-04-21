# MermaidJS Desktop Client

Cross-platform desktop application for creating, editing, and exporting Mermaid diagrams.

**Repository**: https://github.com/skydiver/mermaidjs-desktop-client
**Version**: 2.4.0
**License**: MIT

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | TypeScript 5.9, Vite 7.3, CodeMirror 6, Mermaid 11.12 |
| Desktop shell | Electron 35 (main + preload, contextIsolation on) |
| Packaging | electron-builder 25 |
| Icons | RemixIcon 4.7 |
| Linting | Biome 2.3 |
| Package Manager | npm (also works with pnpm if you prefer) |

## Project Structure

```
mermaidjs-desktop-client/
├── src/                        # Renderer (Vite)
│   ├── main.ts                 # Bootstrap, editor init, state
│   ├── index.html              # UI shell with toolbar & workspace
│   ├── global.d.ts             # `window.api` type augmentation
│   ├── editor/                 # CodeMirror config & Mermaid syntax
│   ├── preview/                # Diagram rendering with debounce
│   ├── toolbar/                # File ops & menu handlers (calls window.api.*)
│   ├── workspace/              # Resizable pane layout
│   ├── window/                 # Editor-zoom persistence (window bounds owned by main)
│   ├── help/                   # Help dialog
│   ├── utils/                  # Debounce utility
│   └── examples/               # Built-in .mmd templates
├── electron/                   # Main process + preload (TypeScript, CJS output)
│   ├── main.ts                 # BrowserWindow, lifecycle, IPC handlers
│   ├── preload.ts              # contextBridge → window.api
│   ├── store.ts                # JSON settings store with debounced atomic writes
│   ├── types.ts                # Shared IPC types / channel names
│   └── tsconfig.json           # CommonJS build → dist-electron/
├── dist/                       # Built renderer (generated)
├── dist-electron/              # Compiled main/preload (generated)
├── release/                    # electron-builder output (generated)
├── electron-builder.yml        # Packaging config
├── package.json
├── tsconfig.json               # Renderer (strict, noEmit)
├── tsconfig.node.json          # Vite config
└── vite.config.ts
```

## Build Commands

```bash
# Install dependencies
npm install

# Dev (two processes via concurrently: Vite dev server + Electron w/ hot renderer)
npm run dev

# Dev renderer only (browser at http://localhost:5173, no desktop shell)
npm run dev:renderer

# Production build (renderer + electron, no installer)
npm run build

# Create installer (.exe / .dmg / .AppImage / .deb per electron-builder.yml)
npm run package

# Code quality
npm run lint                   # Biome check
npm run lint:fix               # Auto-fix
npm run typecheck              # Renderer + main-process tsc --noEmit

# Clean generated output
npm run clean
```

## Prerequisites

- Node.js 18+
- npm 9+ (or pnpm if you prefer — adjust script names)
- No Rust toolchain required (Electron replaced the Tauri/Rust backend).
- Windows: electron-builder downloads the NSIS runner on first `npm run package`; no extra setup.

## How the IPC Bridge Works

The renderer never imports `fs`, `dialog`, `shell`, `ipcRenderer`, etc. directly.
Instead, `electron/preload.ts` exposes a typed `window.api` surface via
`contextBridge.exposeInMainWorld`. Every privileged call goes through an IPC
channel whose contract lives in `electron/types.ts`:

```
Renderer (window.api.fs.readTextFile)
  → preload (ipcRenderer.invoke)
  → main (ipcMain.handle → fs.promises.readFile)
```

Channel names are centralized in `electron/types.ts::IPC_CHANNELS` so main and
preload never drift. Types are shared via `ElectronApi` — the renderer imports
the type in `src/global.d.ts` to augment `Window`.

## Window State Persistence

Window bounds (width/height/x/y/maximized) are persisted **entirely in the main
process** (`electron/main.ts`). On `resize` / `move` the new bounds are written
to `{userData}/settings.json` via a debounced (400ms) atomic write. On `close`
the pending write is flushed immediately.

Editor zoom is persisted from the renderer via `window.api.store.*` (same
underlying JSON file). This matches the old Tauri-Store behavior.

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Renderer bootstrap, CodeMirror init, state management |
| `src/editor/language.ts` | Mermaid syntax highlighting (41 keywords) |
| `src/preview/render.ts` | Diagram rendering with 300ms debounce |
| `src/toolbar/export-diagram.ts` | PNG/SVG export engine (calls `window.api.fs.*`) |
| `electron/main.ts` | Window lifecycle, IPC registrations, state persistence |
| `electron/preload.ts` | `window.api` surface via `contextBridge` |
| `electron/store.ts` | Hand-rolled JSON settings store with atomic writes |
| `electron-builder.yml` | Installer config (Windows/Mac/Linux) |

## Version Synchronization

Version is now in a single place: `package.json` (`"version"`). The main
process uses `app.getVersion()` which reads it automatically.

## Adding Features

### New Toolbar Action
1. Create `src/toolbar/your-action.ts` with `export function setupYourAction(...)`
2. Add button to `src/index.html` with `data-action="your-action"`
3. Import and call setup in `src/toolbar/actions.ts`

### New Example Diagram
1. Add `.mmd` file to `src/examples/` with numeric prefix (e.g., `08-mindmap.mmd`)
2. Add menu item in `src/index.html` under `[data-menu="examples"]`
3. Loaded automatically via Vite glob import

### New Export Format
1. Add to `ExportFormat` type in `src/toolbar/export-menu.ts`
2. Add menu item in HTML
3. Handle in `src/toolbar/export-diagram.ts`

### New Main-Process Capability (new IPC channel)
1. Add the channel name to `electron/types.ts::IPC_CHANNELS`
2. Add the method signature to `ElectronApi` in the same file
3. Register the handler in `electron/main.ts::registerIpc`
4. Wire the bridge in `electron/preload.ts`
5. Call it from the renderer as `window.api.<group>.<method>()`

## Code Style (Biome)

- 2-space indentation, single quotes, trailing commas (ES5)
- 100 char line width, semicolons always
- Prefer `const`, no `var`, LF line endings

## Electron Integrations Used

| API | Purpose |
|-----|---------|
| `BrowserWindow` | Window creation + lifecycle |
| `dialog.showOpenDialog` / `showSaveDialog` / `showMessageBox` | Native file pickers + confirmations |
| `fs.promises` | File I/O (main-process only) |
| `shell.openExternal` | Open URLs in the OS default browser |
| `contextBridge` | Expose `window.api` safely to the renderer |
| `app.getPath('userData')` | Location of `settings.json` |

## Supported File Formats

- `.mmd` (primary), `.mermaid`, `.md`

## Export Capabilities

| Format | Details |
|--------|---------|
| PNG 1x | Min 512px, white background, 10px padding |
| PNG 2x | Min 1024px, `@2x` suffix |
| SVG | Normalized viewBox, 10px padding |

## Security

- Mermaid: `securityLevel: 'strict'`
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the BrowserWindow
- CSP in `src/index.html`: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; script-src 'self'`
- External links rewritten through `shell.openExternal` via `setWindowOpenHandler`
- File access only through typed IPC handlers in `electron/main.ts`

## Debugging

```bash
npm run dev                       # Vite dev server + Electron with DevTools
# Add {devTools: true} or press Ctrl+Shift+I in the window to open DevTools.
```

For main-process breakpoints, launch Electron with `--inspect=9229` and attach
a Node debugger (e.g., `chrome://inspect` in Chromium, or VS Code).

## Migration Notes (Tauri → Electron)

The original app used Tauri 2 with a tiny Rust backend (`src-tauri/`) and the
`@tauri-apps/plugin-{dialog,fs,shell,store}` packages. That backend was
replaced with Electron as of v2.4.0. The renderer API shape was preserved —
most files only changed their imports from `@tauri-apps/*` to calls on
`window.api.*`. See `electron/main.ts` header comments for the mapping rules.
