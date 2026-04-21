// Lightweight parser for Mermaid source → outline entries.
// Not a full AST — just a best-effort regex pass that extracts:
//   - diagram header (graph TD, sequenceDiagram, classDiagram, etc.)
//   - subgraph blocks (name + depth)
//   - top-level node declarations (ID with a label or shape)
//   - class / participant / actor definitions for class & sequence diagrams
//
// Good enough to navigate 95% of real diagrams without pulling in mermaid's
// own parser (which is huge and only available at render time).

export type OutlineKind = 'header' | 'subgraph' | 'node' | 'participant' | 'class';

export interface OutlineEntry {
  kind: OutlineKind;
  label: string;
  /** 1-based line number in the source. */
  line: number;
  depth: number;
}

const DIAGRAM_HEADER_RE =
  /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component)\b/;

// Subgraph declaration — both `subgraph name` and `subgraph "Name with spaces"`.
const SUBGRAPH_RE = /^\s*subgraph\s+(?:"([^"]+)"|(\S+))/;

// Node with optional label — e.g. `A[Start]`, `B("label")`, `C{{decision}}`, `D[[sub]]`.
// Captures the ID and the label text inside any bracket/paren shape. Run globally
// so one-line edges like `A[Start] --> B[End]` yield both nodes.
const NODE_RE_G = /([A-Za-z_][\w-]*)\s*(?:\[|\{|\(|\[\[|\(\()([^\]\}\)]+?)(?:\]|\}|\)|\]\]|\)\))/g;

// Plain arrow edge: `A --> B`, picks up source+target ids (used if no label).
const EDGE_RE = /^\s*([A-Za-z_][\w-]*)\s*(?:--+>|==+>|-?\.-?>|---+|===+|-\.-)/;

// Sequence diagram participants.
const PARTICIPANT_RE = /^\s*(?:participant|actor)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/;

// Class diagram class definitions.
const CLASS_DEF_RE = /^\s*class\s+(\S+)(?:\s*\{[^}]*\})?/;

export function parseOutline(source: string): OutlineEntry[] {
  const lines = source.split(/\r?\n/);
  const entries: OutlineEntry[] = [];
  let depth = 0;
  const seenNodes = new Set<string>();

  // First pass — header (any non-blank, non-comment line).
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    const m = DIAGRAM_HEADER_RE.exec(trimmed);
    if (m) {
      entries.push({
        kind: 'header',
        label: trimmed,
        line: i + 1,
        depth: 0,
      });
    }
    break; // header is always the first content line; stop regardless.
  }

  // Second pass — structure + nodes.
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    // subgraph open/close
    const sub = SUBGRAPH_RE.exec(trimmed);
    if (sub) {
      entries.push({
        kind: 'subgraph',
        label: sub[1] ?? sub[2] ?? 'subgraph',
        line: i + 1,
        depth,
      });
      depth += 1;
      continue;
    }
    if (/^\s*end\b/.test(trimmed)) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    // participants / actors (sequence)
    const part = PARTICIPANT_RE.exec(trimmed);
    if (part) {
      const label = part[1] ?? part[2] ?? 'participant';
      entries.push({ kind: 'participant', label, line: i + 1, depth });
      continue;
    }

    // class definitions (class diagram)
    const cls = CLASS_DEF_RE.exec(trimmed);
    if (cls) {
      entries.push({ kind: 'class', label: cls[1], line: i + 1, depth });
      continue;
    }

    // All node-with-shape declarations on the line (LHS and RHS of edges).
    NODE_RE_G.lastIndex = 0;
    let foundNodeOnLine = false;
    let match: RegExpExecArray | null;
    while ((match = NODE_RE_G.exec(trimmed)) !== null) {
      foundNodeOnLine = true;
      const [, id, label] = match;
      if (!seenNodes.has(id)) {
        seenNodes.add(id);
        entries.push({
          kind: 'node',
          label: `${id} — ${label.trim()}`,
          line: i + 1,
          depth,
        });
      }
    }
    if (foundNodeOnLine) continue;

    // bare edge — capture source id only (for diagrams without labels)
    const edge = EDGE_RE.exec(trimmed);
    if (edge) {
      const id = edge[1];
      if (!seenNodes.has(id)) {
        seenNodes.add(id);
        entries.push({ kind: 'node', label: id, line: i + 1, depth });
      }
    }
  }

  return entries;
}
