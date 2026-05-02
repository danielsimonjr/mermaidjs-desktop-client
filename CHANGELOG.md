# Changelog

All notable changes to this project are documented here.
The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **FS IPC path allow-list (main process).** `fs:readTextFile`,
  `fs:writeTextFile`, and `fs:writeFile` now require the renderer-supplied
  path to have been previously returned by `dialog:showOpenDialog` or
  `dialog:showSaveDialog` in the same session. Paths are canonicalized via
  `path.resolve()` before allow-list lookup. NUL bytes and Windows
  DOS-device prefixes (`\\?\`, `\\.\`) are rejected outright; UNC paths are
  only reachable when the dialog itself returned them. Closes the
  pre-existing gap where a renderer-side XSS (e.g. via the `innerHTML`
  preview path) could read or overwrite arbitrary files.

### Changed

- **Mermaid upgraded `^9.1.7` → `^11.14.0`**. The two APIs the renderer
  consumes (`mermaid.render(id, src, container) → { svg }` and
  `mermaid.initialize({ startOnLoad, securityLevel, theme })`) are
  unchanged across v9 → v11, so no source changes were required.
  Renderer dynamic-import (`import('mermaid')`) and `m.default` access
  remain compatible with v11's ESM-only distribution.
- Adds the new v11 diagram chunks (architecture, block, kanban, packet,
  treemap, radar, ishikawa, etc.) automatically via Vite code-splitting.

### Security

- Drops 9 transitive `npm audit` advisories (10 high + 1 critical → 0
  high/critical, 2 moderate remain). Most were in the `d3-color` /
  `dagre-d3` chain that v11 no longer pulls in.

## [2.4.0] - 2026-04-21

Major architectural refactor: the desktop shell moves from Tauri (Rust) to
Electron, and the project standardizes on npm. The renderer API shape was
preserved — most renderer files only changed their imports from
`@tauri-apps/*` to calls on the typed `window.api.*` bridge exposed by the
new preload.

### Changed

- **Desktop shell**: Tauri 2 / Rust backend replaced with Electron 35
  (`main` + `preload`, `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`).
- **Packaging**: `tauri build` replaced with `electron-builder` 25 driven by
  `electron-builder.yml`. Windows installer uses NSIS + Squirrel lifecycle
  handling (`electron-squirrel-startup`).
- **Package manager**: standardized on **npm** (pnpm still works). Scripts
  renamed accordingly — `dev`, `build`, `package`, `clean`, `typecheck`,
  `lint`, `test`, `test:coverage`.
- **Window persistence**: bounds (width/height/x/y/maximized) are now owned
  entirely by the main process and written atomically (debounced 400 ms) to
  `{userData}/settings.json`. Pending writes are flushed on `close`.
- **Renderer ↔ main bridge**: every privileged call goes through an IPC
  channel defined in `electron/types.ts::IPC_CHANNELS` and consumed via
  `window.api.{fs,dialog,shell,store,app}`. The renderer no longer imports
  `fs`, `dialog`, `shell`, or `ipcRenderer` directly.
- **Security**: Mermaid kept at `securityLevel: 'strict'`; CSP tightened in
  `src/index.html` (`script-src 'self'`, `img-src 'self' data:`, etc.).
- **Vite**: switched to relative `base: './'` so the packaged renderer loads
  correctly from `file://`.

### Added

- **Command palette** (`src/palette/`): registry-driven command surface with
  fuzzy search. Every user-executable action (file ops, theme switch, export,
  help) is registered once in `CommandRegistry` so the palette, activity bar,
  and keyboard shortcuts never drift.
- **Outline view** (`src/outline/`): lightweight regex-based parser extracts
  the diagram header, subgraphs, nodes, participants, and class definitions
  from Mermaid source to produce a navigable outline without pulling in
  Mermaid's own parser.
- **Mermaid theme picker** (`src/preview/theme.ts`): choose between
  `default`, `dark`, `forest`, `neutral`. Persisted via `window.api.store`.
- **Copy SVG to clipboard** (`src/preview/copy-svg.ts`): one-click copy of
  the live preview as serialized SVG XML.
- **Recent files** (`src/toolbar/recent-files.ts`): persisted list of the
  last 10 opened/saved files; deduplicated and capped.
- **Editor status counter** (`src/editor/counter.ts`): live line / column /
  character count as a CodeMirror extension.
- **Reusable UI primitives** (`src/ui/`): `dropdown` (positioned menu with
  outside-click + Escape dismiss, `aria-expanded` sync) and `toast`
  (ephemeral status messages).
- **Test suite**: Vitest 4 + `happy-dom` + `@vitest/coverage-v8`. ~20 test
  files covering editor, preview, outline, palette, toolbar, electron main /
  preload / store, window, workspace, and UI primitives.
- **Typed renderer globals** (`src/global.d.ts`): augments `Window` with
  `ElectronApi` imported from `electron/types.ts` so main and preload can
  never drift out of contract with the renderer.

### Removed

- `src-tauri/` (Rust backend, `tauri.conf.json`, `Cargo.*`, icon sources).
- `@tauri-apps/*` runtime dependencies (`plugin-dialog`, `plugin-fs`,
  `plugin-shell`, `plugin-store`) and the Rust toolchain prerequisite.
- `pnpm-lock.yaml` (replaced by `package-lock.json`).

### Fixed

- Window close no longer leaves a zombie process on Windows (carried over
  from the `88f1c17` fix; still relevant post-refactor).
- **Preload script failed to load under `sandbox: true`** (commit
  `70c2191`). `electron/preload.ts` was importing `IPC_CHANNELS` at
  runtime from `./types`, which compiled to `require("./types")`.
  Sandboxed preloads can only `require('electron')` and a handful of
  built-ins, so the call aborted the preload with "module not found",
  `contextBridge.exposeInMainWorld` never ran, and `window.api` was
  left `undefined` in the renderer — every IPC-backed toolbar action
  silently no-op'd via its outer `try/catch`. Fix: inline the channel
  constants in `preload.ts`, demote all other `./types` imports to
  `import type`. A new drift-detection test
  (`tests/electron/preload.test.ts`) asserts the inlined literal stays
  in lockstep with `types.ts::IPC_CHANNELS`. Mocked-electron tests did
  not exercise the sandboxed-preload path, which is why this escaped
  the 322-test suite.
- **Native file dialogs could appear hidden behind the main window on
  Windows** (commit `1c075ef`). The three dialog IPC handlers used
  `dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined!, opts)`.
  `getFocusedWindow()` briefly returns `null` during a dropdown-close
  → menu-click transition; the `!` non-null assertion lied to the type
  system, `undefined` reached Electron, and the resulting parentless
  native dialog had no guaranteed z-order. Replaced with a
  `dialogParent()` helper that prefers focused-window and falls back
  to the module-level `mainWindow`, with explicit parent-less
  overloads for the truly-unavailable case.
- **New Diagram button appeared broken on an unmodified doc** (commit
  `9a65409`). The click handler ran correctly, but every effect was
  content-identical to the current state (editor content unchanged,
  preview identical, path already `null`) — the only on-screen effect
  was a sub-second status-strip flash. Fix: always reset cursor +
  scroll + focus, and surface a success toast ("New diagram created")
  so the click has an observable outcome regardless of whether the
  text actually changed.

### Performance

- **Installer shrunk ~29%** and **`app.asar` shrunk ~94%** by reclassifying
  renderer-only dependencies (`mermaid`, `codemirror`, `@codemirror/*`,
  `remixicon`) as `devDependencies`. They're already bundled into
  `dist/assets/` by Vite, so shipping them again as `node_modules` inside
  the asar was double-packing. Only `electron-squirrel-startup` — the one
  module required at main-process runtime — remains in `dependencies`.
- **Startup: `app.asar` 141 MB → 8 MB.** Electron mmaps the asar at launch
  and consults its file index on every `require()`; a 17× smaller asar
  with ~6 entries measurably shortens cold start.
- **Locale pakfiles trimmed.** A new `scripts/after-pack.js` hook (wired in
  via `electron-builder.yml::afterPack`) removes every `locales/*.pak`
  except `en-US.pak` — the app UI is English-only, so the other 54 files
  (~41 MB) were dead weight for both installer size and first-launch
  scanning.
- `npm run package` now runs `npm run clean` first, so stale prior-version
  installers don't accumulate in `release/`.
- **Renderer cold-start: initial bundle 1,030 kB → 430 kB (−58%).** Mermaid
  is now dynamic-imported (`src/preview/mermaid-loader.ts`) so the ~600 kB
  library doesn't parse/compile during window boot; it loads on first
  render, theme apply, or export. The memoized loader means concurrent
  callers share one import and subsequent calls are instant.
- **Main process: `settingsStore.load()` runs in parallel with
  `BrowserWindow` construction** instead of serially. Bounds are applied
  via `setBounds` once the read resolves, before `ready-to-show`, so there
  is no visible geometry flash. Shaves whichever of `loadSettings` /
  `spawnRenderer` finishes first off cold start.

### Documentation

- README gains a **Code signing** section describing the `CSC_LINK` /
  `CSC_KEY_PASSWORD` env-var workflow for Windows Authenticode and the
  `APPLE_*` env vars for macOS Developer ID + notarization. The build
  remains unsigned by default.

### Build + release infrastructure

- `electron-builder.yml` now sets `compression: maximum`. This is a no-op
  for the current Squirrel.Windows target (Squirrel defers to NuGet's
  fixed compression), but applies automatically if NSIS / DMG / AppImage
  targets are ever added.
- `publish: null` replaced with a `github` provider pointing at
  `danielsimonjr/mermaidjs-desktop-client`. Squirrel now embeds an
  update-check URL in every build; actually uploading artifacts still
  requires `--publish always` and `GH_TOKEN`, so local and CI builds are
  unaffected.
- New GitHub Actions workflow (`.github/workflows/ci.yml`) runs typecheck,
  tests, and a renderer+main build on every push to `master` and every PR.
  Lint is intentionally excluded for now — the tree has a ~120-item
  CRLF / import-sort backlog that should be cleared as a separate pass.
- `.gitattributes` added with `* text=auto eol=lf` so future checkouts
  don't accumulate new CRLF drift on Windows.
- Dead `src-tauri/**` ignore patterns removed from `biome.jsonc`;
  `dist-ssr` (Vite SSR output, unused — this isn't an SSR app) removed
  from `.gitignore`.

### Internal

- `.gitignore` now excludes `dist-electron/`, `release/`, and `coverage/`
  (note: `build/` is kept tracked — it's the electron-builder resources
  directory holding icon assets).
- Biome config externalized to `biome.jsonc`.
- `.claude/CLAUDE.md` rewritten to describe the Electron architecture, IPC
  contract, and feature-addition checklist.

## [2.3.1]

- Fix window close not terminating process.

## [2.3.0]

- Dependency updates.

## [2.1.0]

- README updates; Rust project info.

## [2.0.0]

- Baseline Tauri release.
