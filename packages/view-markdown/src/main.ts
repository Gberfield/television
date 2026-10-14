import "./styles.css";
import "./colors.css";
import {
  ArtifactContext,
  installBridge,
  WebviewArtifactContext,
} from "@telepath-computer/television-artifact/browser";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorExtensions, installEditor } from "./editor.ts";
import seed from "../fixtures/seed.md?raw";

// Live-preview markdown view.
//
// In production the view loads inside a Television iframe or Electron
// webview. We construct the matching host context (which posts `ready`
// synchronously) and hand the editor mount point to `installEditor`, which
// builds the CodeMirror view,
// debounces `docChanged` → `ctx.updateContent`, suppresses save echoes,
// replaces the doc on remote edits, and rolls back on save errors.
//
// In dev (`npm run dev`) the page loads standalone with no parent host.
// The fixture seed is loaded directly into a plain EditorView so the e2e
// suite has a deterministic doc to drive without needing a host stub.

const parent = document.getElementById("editor");
if (!parent) {
  throw new Error("Editor mount point #editor not found");
}

const isWebview = !!(window as Window & { __televisionContentBridge?: unknown }).__televisionContentBridge;
const isFramed = window.parent !== window;
const standalone = !isWebview && !isFramed;

if (isFramed) {
  installBridge(window);
}

const context = standalone
  ? null
  : isWebview ? new WebviewArtifactContext() : new ArtifactContext();
let styleRevision = 0;
context?.onStylesChanged(() => {
  const current = document.querySelector<HTMLLinkElement>(
    'link[data-television-style="canonical"]',
  );
  if (!current) return;
  const next = new URL(current.href);
  styleRevision += 1;
  next.searchParams.set("tv-styles", `${Date.now()}-${styleRevision}`);
  current.href = next.href;
});

const view = context === null
  ? new EditorView({
      parent,
      state: EditorState.create({ doc: seed, extensions: editorExtensions }),
    })
  : installEditor({ parent, ctx: context }).view;

// Expose the EditorView for e2e tests. Inline-code body text is a bare
// text node inside `.cm-line` (lang-markdown's CodeText tag has no rule
// in `markdownHighlight`), so Playwright's `getByText` can't locate
// it. Tests dispatch transactions on this handle to position the caret
// programmatically. Harmless in production; the package is private and
// only ever loaded inside the editor iframe.
(window as Window & { __cmView?: EditorView }).__cmView = view;

// Remember the reading position in this view's browser session. Hashing the
// content separates documents without persisting Markdown text in storage.
function readingPositionKey(): string {
  const content = view.state.doc.toString();
  const FNV_OFFSET = 2166136261;
  const FNV_PRIME = 16777619;
  const HEX_RADIX = 16;
  let hash = FNV_OFFSET;
  for (let index = 0; index < content.length; index += 1) {
    hash = Math.imul(hash ^ content.charCodeAt(index), FNV_PRIME);
  }
  return `television:reading-position:${(hash >>> 0).toString(HEX_RADIX)}:${content.length}`;
}

let restoringPosition = false;
function saveReadingPosition(): void {
  if (restoringPosition || view.state.doc.length === 0) return;
  try {
    sessionStorage.setItem(readingPositionKey(), JSON.stringify({
      top: view.scrollDOM.scrollTop,
      left: view.scrollDOM.scrollLeft,
    }));
  } catch {
    // Restricted/full storage must not prevent reading or navigation.
  }
}

function restoreReadingPosition(): void {
  let position: { top: number; left: number };
  try {
    const raw = sessionStorage.getItem(readingPositionKey());
    if (!raw) return;
    position = JSON.parse(raw) as typeof position;
    if (!Number.isFinite(position.top) || !Number.isFinite(position.left)) return;
  } catch { return; }
  restoringPosition = true;
  view.requestMeasure({
    read: () => position,
    write: (saved) => {
      view.scrollDOM.scrollTo(saved.left, saved.top);
      requestAnimationFrame(() => { restoringPosition = false; });
    },
  });
}

view.scrollDOM.addEventListener("scroll", saveReadingPosition, { passive: true });
window.addEventListener("pagehide", saveReadingPosition);
if (context === null) {
  restoreReadingPosition();
} else {
  let initialContent = true;
  context.addEventListener("content-updated", () => {
    if (!initialContent) return;
    initialContent = false;
    restoreReadingPosition();
  });
}
