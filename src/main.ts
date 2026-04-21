import { indentWithTab } from '@codemirror/commands';
import { EditorState, StateEffect, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { basicSetup, EditorView } from 'codemirror';
import 'remixicon/fonts/remixicon.css';

import { createCounterExtension } from './editor/counter';
import { createMermaidLanguage } from './editor/language';
import { createEditorTheme } from './editor/theme';
import {
  createEditorZoomController,
  createEditorZoomExtension,
  createEditorZoomKeymap,
} from './editor/zoom';
import { setupHelpDialog } from './help/dialog';
import { createOutline } from './outline/view';
import { globalRegistry } from './palette/registry';
import { createPalette } from './palette/ui';
import { setupCopySvg } from './preview/copy-svg';
import { createPreview } from './preview/render';
import { createMermaidTheme, type MermaidTheme } from './preview/theme';
import {
  createZoomController,
  setupWheelZoom,
  setupZoomControls,
  updateLevelDisplay,
} from './preview/zoom';
import type { ExampleItem } from './toolbar/examples-menu';
import { setupExamplesMenu } from './toolbar/examples-menu';
import { setupExportMenu, type ExportFormat } from './toolbar/export-menu';
import { createExportHandler } from './toolbar/export-diagram';
import { setupNewDiagramAction } from './toolbar/new-diagram';
import { openPath, pickAndOpenDiagram } from './toolbar/open-diagram';
import { basenameOf, createRecentFiles } from './toolbar/recent-files';
import { saveDiagram } from './toolbar/save-diagram';
import { setupToolbarShortcuts } from './toolbar/shortcuts';
import { createDropdown } from './ui/dropdown';
import {
  loadEditorZoom,
  loadSettingsStore,
  saveEditorZoom,
  setupWindowPersistence,
} from './window/state';
import { initHorizontalResize } from './workspace/resize';

const DEFAULT_SNIPPET = `graph TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- Not yet --> D[Keep iterating]`;

const RENDER_DELAY = 300;
const WINDOW_PERSIST_DELAY = 400;

const MERMAID_LANGUAGE = createMermaidLanguage();
const EDITOR_THEME = createEditorTheme();

window.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap(): Promise<void> {
  // ---- DOM references (new layout) --------------------------------------
  const shell = document.querySelector<HTMLDivElement>('.app-shell');
  const host = document.querySelector<HTMLDivElement>('#editor-host');
  const previewElement = document.querySelector<HTMLDivElement>('#preview-host');

  // Activity bar
  const newDiagramButton = document.querySelector<HTMLButtonElement>('[data-action="new-diagram"]');
  const openMenuButton = document.querySelector<HTMLButtonElement>('[data-action="open-menu"]');
  const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save-diagram"]');
  const outlineToggleBtn = document.querySelector<HTMLButtonElement>(
    '[data-action="toggle-outline"]'
  );
  const examplesButton = document.querySelector<HTMLButtonElement>(
    '[data-action="examples-menu"]'
  );
  const exportButton = document.querySelector<HTMLButtonElement>('[data-action="export-menu"]');
  const themeButton = document.querySelector<HTMLButtonElement>('[data-action="theme-menu"]');
  const paletteButton = document.querySelector<HTMLButtonElement>(
    '[data-action="command-palette"]'
  );
  const helpButton = document.querySelector<HTMLButtonElement>('[data-action="help"]');

  // Menus (top-level, positioned by dropdown helper)
  const openMenu = document.querySelector<HTMLDivElement>('[data-menu="open"]');
  const examplesMenu = document.querySelector<HTMLDivElement>('[data-menu="examples"]');
  const exportMenu = document.querySelector<HTMLDivElement>('[data-menu="export"]');
  const themeMenu = document.querySelector<HTMLDivElement>('[data-menu="theme"]');

  // Preview header action + zoom
  const copySvgBtn = document.querySelector<HTMLButtonElement>('[data-action="copy-svg"]');
  const workspace = document.querySelector<HTMLDivElement>('.workspace');
  const editorPane = document.querySelector<HTMLElement>('[data-pane="editor"]');
  const previewPane = document.querySelector<HTMLElement>('[data-pane="preview"]');
  const divider = document.querySelector<HTMLDivElement>('.divider');
  const zoomInBtn = document.querySelector<HTMLButtonElement>('[data-action="zoom-in"]');
  const zoomOutBtn = document.querySelector<HTMLButtonElement>('[data-action="zoom-out"]');
  const zoomResetBtn = document.querySelector<HTMLButtonElement>('[data-action="zoom-reset"]');
  const zoomLevelDisplay = document.querySelector<HTMLSpanElement>('[data-zoom-level]');

  // Outline sidebar
  const outlineList = document.querySelector<HTMLUListElement>('[data-outline-list]');

  // Footer
  const statusMessage = document.querySelector<HTMLSpanElement>('[data-status="message"]');
  const statusFileName = document.querySelector<HTMLSpanElement>('[data-status-file]');
  const statusFileWrap = document.querySelector<HTMLSpanElement>('[data-status="file"]');
  const counterEl = document.querySelector<HTMLSpanElement>('[data-counter]');

  if (!host || !previewElement) return;

  // ---- Controllers ------------------------------------------------------
  const mermaidTheme = createMermaidTheme((theme) => {
    schedulePreviewRender(editor.state.doc.toString()); // re-render when theme changes
    document.body.dataset.mermaidTheme = theme;
  });
  await mermaidTheme.initialize();

  const store = await loadSettingsStore();
  const recentFiles = createRecentFiles();

  const zoomController = createZoomController(previewElement, (level) => {
    if (zoomLevelDisplay) updateLevelDisplay(zoomLevelDisplay, level);
  });
  setupZoomControls(zoomController, zoomInBtn, zoomOutBtn, zoomResetBtn, zoomLevelDisplay);
  if (previewPane) setupWheelZoom(previewPane, zoomController);

  if (store) {
    await setupWindowPersistence(store, null, WINDOW_PERSIST_DELAY);
  }

  const status = createStatusController(statusMessage);
  const fileStatus = createFileStatusController(statusFileWrap, statusFileName);

  // ---- Editor state -----------------------------------------------------
  let lastCommittedDoc = DEFAULT_SNIPPET;
  let isDocumentDirty = false;
  let lastSavedAt: Date | null = null;
  let currentFilePath: string | null = null;

  const updateFileStatus = () => {
    fileStatus.update({
      path: currentFilePath,
      dirty: isDocumentDirty,
      lastSavedAt,
    });
  };

  const schedulePreviewRender = createPreview(previewElement, RENDER_DELAY, {
    onRenderStart() {
      status.rendering();
    },
    onRenderSuccess() {
      status.success('Preview updated');
      zoomController.applyZoom();
    },
    onRenderEmpty() {
      status.info('Waiting for Mermaid markup…');
    },
    onRenderError(details) {
      status.error(details);
    },
  });

  const handleDocChange = (doc: string) => {
    isDocumentDirty = doc !== lastCommittedDoc;
    updateFileStatus();
    outline?.update(doc);
  };

  const commitDocument = (doc: string, options?: { saved?: boolean }) => {
    lastCommittedDoc = doc;
    isDocumentDirty = false;
    if (options?.saved) {
      lastSavedAt = new Date();
    } else if (!currentFilePath) {
      lastSavedAt = null;
    }
    updateFileStatus();
  };

  const { extension: zoomExtension, compartment: zoomCompartment } = createEditorZoomExtension();
  const counterExt = createCounterExtension(counterEl);
  const editor = createEditor(
    host,
    DEFAULT_SNIPPET,
    schedulePreviewRender,
    handleDocChange,
    zoomExtension,
    counterExt
  );

  const savedEditorZoom = store ? await loadEditorZoom(store) : null;
  const editorZoomController = createEditorZoomController(
    editor,
    zoomCompartment,
    (level) => {
      if (store) void saveEditorZoom(store, level);
    },
    savedEditorZoom ?? undefined
  );
  editor.dispatch({
    effects: StateEffect.appendConfig.of(createEditorZoomKeymap(editorZoomController)),
  });

  commitDocument(editor.state.doc.toString());
  editor.focus();
  host.dataset.editor = 'mounted';
  previewElement.dataset.preview = 'ready';
  schedulePreviewRender(editor.state.doc.toString());
  initHorizontalResize(workspace, editorPane, previewPane, divider);

  // ---- Outline ----------------------------------------------------------
  const outline = createOutline({
    list: outlineList,
    shell,
    toggleButton: outlineToggleBtn,
    editor,
  });
  outline.update(editor.state.doc.toString());
  outlineToggleBtn?.addEventListener('click', () => outline.toggle());

  // ---- File actions (piping through recent-files) -----------------------
  const openCtx = {
    editor,
    schedulePreviewRender,
    onPathChange: async (path: string | null) => {
      const previousPath = currentFilePath;
      currentFilePath = path;
      if (path === null) {
        lastSavedAt = null;
      } else if (path !== previousPath) {
        lastSavedAt = null;
        await recentFiles.push(path);
        await refreshRecentMenu();
      }
      updateFileStatus();
    },
    onOpen(doc: string) {
      commitDocument(doc);
    },
    shouldReplace: async () => {
      if (!isDocumentDirty) return true;
      return confirmReplace('Replace the current diagram with the selected file?');
    },
  };

  const saveCtx = {
    editor,
    getPath: () => currentFilePath,
    onPathChange: openCtx.onPathChange,
    onSave(doc: string) {
      commitDocument(doc, { saved: true });
    },
  };

  setupNewDiagramAction({
    editor,
    schedulePreviewRender,
    button: newDiagramButton,
    defaultSnippet: DEFAULT_SNIPPET,
    onPathChange: openCtx.onPathChange,
    shouldReplace: async () => {
      if (!isDocumentDirty) return true;
      return confirmReplace('Overwrite the current diagram with a blank template?');
    },
    onNew(doc) {
      commitDocument(doc);
    },
  });

  saveButton?.addEventListener('click', () => void saveDiagram(saveCtx));

  // ---- Recent-files dropdown attached to the Open button ----------------
  let openMenuDropdown: ReturnType<typeof createDropdown> | null = null;
  if (openMenuButton && openMenu) {
    openMenuDropdown = createDropdown({ button: openMenuButton, menu: openMenu });
  }
  async function refreshRecentMenu(): Promise<void> {
    if (!openMenu) return;
    const paths = await recentFiles.read();
    openMenu.innerHTML = '';
    const pickItem = makeMenuItem({
      icon: 'folder-open-line',
      label: 'Open file…',
      onClick: async () => {
        openMenuDropdown?.close();
        const path = await pickAndOpenDiagram(openCtx);
        if (path) commitDocument(editor.state.doc.toString());
      },
    });
    openMenu.append(pickItem);
    if (paths.length > 0) {
      openMenu.append(makeMenuDivider());
      openMenu.append(makeMenuLabel('Recent'));
      for (const path of paths) {
        const item = makeMenuItem({
          icon: 'file-line',
          label: basenameOf(path),
          tailPath: path,
          onClick: async () => {
            openMenuDropdown?.close();
            const loaded = await openPath(openCtx, path);
            if (loaded) commitDocument(editor.state.doc.toString());
          },
        });
        openMenu.append(item);
      }
      openMenu.append(makeMenuDivider());
      openMenu.append(
        makeMenuItem({
          icon: 'delete-bin-line',
          label: 'Clear recent',
          onClick: async () => {
            openMenuDropdown?.close();
            await recentFiles.clear();
            await refreshRecentMenu();
          },
        })
      );
    }
  }
  await refreshRecentMenu();

  // ---- Export dropdown (positioned at activity-bar) ---------------------
  const handleExport = createExportHandler({ editor, getPath: () => currentFilePath });
  if (exportButton && exportMenu) {
    setupExportMenu({ button: exportButton, menu: exportMenu, onSelect: handleExport });
  }

  // ---- Examples dropdown ------------------------------------------------
  if (examplesButton && examplesMenu) {
    setupExamplesMenu({
      button: examplesButton,
      menu: examplesMenu,
      items: loadExamples(),
      onSelect: async (content) => {
        if (isDocumentDirty) {
          const proceed = await confirmReplace('Replace the current diagram with this example?');
          if (!proceed) return;
        }
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: content },
        });
        schedulePreviewRender(content);
        void openCtx.onPathChange(null);
      },
    });
  }

  // ---- Theme picker dropdown --------------------------------------------
  let themeDropdown: ReturnType<typeof createDropdown> | null = null;
  if (themeButton && themeMenu) {
    themeDropdown = createDropdown({ button: themeButton, menu: themeMenu });
    themeMenu.addEventListener('click', async (event) => {
      const item = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        '.toolbar-menu-item'
      );
      if (!item?.dataset.theme) return;
      await mermaidTheme.set(item.dataset.theme as MermaidTheme);
      themeDropdown?.close();
    });
    // Mark current selection
    themeMenu.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((btn) => {
      if (btn.dataset.theme === mermaidTheme.get()) btn.dataset.active = 'true';
    });
  }

  // ---- Copy SVG --------------------------------------------------------
  setupCopySvg(copySvgBtn, previewElement);

  // ---- Keyboard shortcuts (wire to activity bar buttons) ----------------
  setupToolbarShortcuts({
    newButton: newDiagramButton,
    openButton: openMenuButton, // Ctrl+O opens the recent menu (first item is "Open file…")
    saveButton,
  });

  // ---- Command palette --------------------------------------------------
  const palette = createPalette(globalRegistry);
  paletteButton?.addEventListener('click', () => palette.toggle());

  registerPaletteCommands({
    registry: globalRegistry,
    onNew: () => newDiagramButton?.click(),
    onOpen: () => pickAndOpenDiagram(openCtx),
    onSave: () => saveDiagram(saveCtx),
    onExport: (fmt) => handleExport(fmt),
    onTheme: (t) => mermaidTheme.set(t),
    onToggleOutline: () => outline.toggle(),
    onHelp: () => helpButton?.click(),
    onCopySvg: () => copySvgBtn?.click(),
    onZoomReset: () => zoomController.reset(),
  });

  // ---- Help dialog ------------------------------------------------------
  setupHelpDialog(helpButton);
}

/* ========================================================================== *
 * Editor construction
 * ========================================================================== */

function createEditor(
  host: HTMLElement,
  initialDoc: string,
  schedulePreviewRender: (doc: string) => void,
  onDocChange: ((doc: string) => void) | undefined,
  ...extraExtensions: Extension[]
): EditorView {
  const extensions: Extension[] = [
    basicSetup,
    MERMAID_LANGUAGE,
    EditorView.lineWrapping,
    EDITOR_THEME,
    keymap.of([indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const nextDoc = update.state.doc.toString();
        schedulePreviewRender(nextDoc);
        onDocChange?.(nextDoc);
      }
    }),
    ...extraExtensions,
  ];

  const state = EditorState.create({ doc: initialDoc, extensions });
  return new EditorView({ parent: host, state });
}

/* ========================================================================== *
 * Status + file status controllers
 * ========================================================================== */

type StatusLevel = 'idle' | 'loading' | 'success' | 'error' | 'info';

function createStatusController(element: HTMLSpanElement | null): {
  idle(message?: string): void;
  rendering(message?: string): void;
  success(message?: string): void;
  info(message: string): void;
  error(details: string): void;
} {
  const noop = () => {
    /* empty */
  };
  if (!element) {
    return { idle: noop, rendering: noop, success: noop, info: noop, error: noop };
  }
  const target = element;
  const defaultMessage = (target.textContent || 'Ready.').trim() || 'Ready.';
  let revertTimer: number | null = null;

  function setStatus(message: string, level: StatusLevel, autoRevert = false): void {
    if (revertTimer !== null) {
      window.clearTimeout(revertTimer);
      revertTimer = null;
    }
    target.textContent = message;
    target.dataset.statusLevel = level;
    if (autoRevert) {
      revertTimer = window.setTimeout(() => {
        target.textContent = defaultMessage;
        target.dataset.statusLevel = 'idle';
        revertTimer = null;
      }, 4000);
    }
  }

  setStatus(defaultMessage, 'idle');

  return {
    idle(message) {
      setStatus(message ?? defaultMessage, 'idle');
    },
    rendering(message = 'Rendering…') {
      setStatus(message, 'loading');
    },
    success(message = 'Preview updated') {
      setStatus(message, 'success', true);
    },
    info(message) {
      setStatus(message, 'info');
    },
    error(details) {
      const summary = details.split(/\r?\n/, 1)[0]?.trim() ?? 'Unknown error';
      setStatus(`Render failed: ${summary}`, 'error');
    },
  };
}

interface FileStatusState {
  path: string | null;
  dirty: boolean;
  lastSavedAt: Date | null;
}

function createFileStatusController(
  wrapper: HTMLSpanElement | null,
  nameEl: HTMLSpanElement | null
): { update(state: FileStatusState): void } {
  const noop = () => {
    /* empty */
  };
  if (!wrapper || !nameEl) {
    return { update: noop };
  }
  return {
    update({ path, dirty, lastSavedAt }) {
      const name = path ? basenameOf(path) : 'Untitled';
      nameEl.textContent = name + (dirty ? ' •' : '');
      wrapper.dataset.dirty = dirty ? 'true' : 'false';
      const saved = lastSavedAt ? ` · Saved ${formatTime(lastSavedAt)}` : '';
      wrapper.title = path
        ? `${path}${saved}`
        : dirty
          ? 'Unsaved changes'
          : 'Untitled diagram';
    },
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ========================================================================== *
 * Menu item helpers
 * ========================================================================== */

function makeMenuItem(options: {
  icon: string;
  label: string;
  tailPath?: string;
  onClick: () => void | Promise<void>;
}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toolbar-menu-item';
  btn.setAttribute('role', 'menuitem');

  const i = document.createElement('i');
  i.className = `menu-item-icon ri-${options.icon}`;
  i.setAttribute('aria-hidden', 'true');
  btn.append(i);

  const label = document.createElement('span');
  label.textContent = options.label;
  btn.append(label);

  if (options.tailPath) {
    const tail = document.createElement('span');
    tail.className = 'menu-item-path';
    tail.textContent = options.tailPath;
    btn.append(tail);
  }

  btn.addEventListener('click', () => {
    void options.onClick();
  });
  return btn;
}

function makeMenuDivider(): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'toolbar-menu-divider';
  div.setAttribute('role', 'separator');
  return div;
}

function makeMenuLabel(text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'toolbar-menu-label';
  div.textContent = text;
  return div;
}

/* ========================================================================== *
 * Confirmation dialog
 * ========================================================================== */

async function confirmReplace(message: string): Promise<boolean> {
  try {
    return await window.api.dialog.ask(message, {
      title: 'Discard unsaved changes?',
      kind: 'warning',
    });
  } catch (error) {
    console.warn('Unable to show confirmation dialog', error);
    return false;
  }
}

/* ========================================================================== *
 * Examples loader (Vite glob, unchanged)
 * ========================================================================== */

function loadExamples(): ExampleItem[] {
  const modules = import.meta.glob('./examples/*.mmd', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  return Object.entries(modules)
    .map(([path, content]) => {
      const match = path.match(/\/([^/]+)\.mmd$/);
      const id = match?.[1];
      /* v8 ignore next — defensive fallback for a malformed glob path. */
      if (!id) return null;
      const { order, name } = parseExampleId(id);
      return {
        id: name,
        label: formatExampleLabel(name),
        content,
        order,
      };
    })
    .filter((item): item is ExampleItem => item !== null)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
}

function formatExampleLabel(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function parseExampleId(rawId: string): { name: string; order: number } {
  const [, orderPart, namePart] = rawId.match(/^(\d+)[-_](.+)$/) ?? [];
  if (orderPart && namePart) {
    return { name: namePart, order: Number.parseInt(orderPart, 10) };
  }
  /* v8 ignore next */
  return { name: rawId, order: Number.MAX_SAFE_INTEGER };
}

/* ========================================================================== *
 * Palette command registration
 * ========================================================================== */

interface PaletteHandlers {
  registry: typeof globalRegistry;
  onNew: () => void;
  onOpen: () => void | Promise<unknown>;
  onSave: () => void | Promise<unknown>;
  onExport: (fmt: ExportFormat) => void | Promise<void>;
  onTheme: (t: MermaidTheme) => void | Promise<void>;
  onToggleOutline: () => void;
  onHelp: () => void;
  onCopySvg: () => void;
  onZoomReset: () => void;
}

function registerPaletteCommands(h: PaletteHandlers): void {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? '⌘' : 'Ctrl';
  h.registry.registerAll([
    { id: 'file.new', label: 'New diagram', icon: 'file-add-line', category: 'File',
      keybinding: [mod, 'N'], run: h.onNew },
    { id: 'file.open', label: 'Open file…', icon: 'folder-open-line', category: 'File',
      keybinding: [mod, 'O'], run: () => void h.onOpen() },
    { id: 'file.save', label: 'Save', icon: 'save-3-line', category: 'File',
      keybinding: [mod, 'S'], run: () => void h.onSave() },
    { id: 'export.png', label: 'Export as PNG', icon: 'image-line', category: 'Export',
      run: () => void h.onExport('png') },
    { id: 'export.png2x', label: 'Export as PNG ×2', icon: 'image-2-line', category: 'Export',
      run: () => void h.onExport('pngx2') },
    { id: 'export.svg', label: 'Export as SVG', icon: 'code-s-slash-line', category: 'Export',
      run: () => void h.onExport('svg') },
    { id: 'view.toggleOutline', label: 'Toggle outline sidebar', icon: 'list-unordered',
      category: 'View', run: h.onToggleOutline },
    { id: 'view.copySvg', label: 'Copy SVG to clipboard', icon: 'file-copy-line',
      category: 'View', run: h.onCopySvg },
    { id: 'view.zoomReset', label: 'Reset preview zoom', icon: 'refresh-line',
      category: 'View', run: h.onZoomReset },
    { id: 'theme.default', label: 'Default theme', icon: 'contrast-line', category: 'Theme',
      run: () => void h.onTheme('default') },
    { id: 'theme.dark', label: 'Dark theme', icon: 'moon-line', category: 'Theme',
      run: () => void h.onTheme('dark') },
    { id: 'theme.forest', label: 'Forest theme', icon: 'leaf-line', category: 'Theme',
      run: () => void h.onTheme('forest') },
    { id: 'theme.neutral', label: 'Neutral theme', icon: 'contrast-2-line', category: 'Theme',
      run: () => void h.onTheme('neutral') },
    { id: 'help.open', label: 'Open help', icon: 'question-line', category: 'Help',
      keybinding: ['F1'], run: h.onHelp },
  ]);
}
