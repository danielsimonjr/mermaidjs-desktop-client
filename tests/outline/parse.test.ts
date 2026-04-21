import { describe, it, expect } from 'vitest';

import { parseOutline } from '../../src/outline/parse';

describe('parseOutline', () => {
  it('returns empty list for an empty document', () => {
    expect(parseOutline('')).toEqual([]);
  });

  it('captures the diagram header (graph TD)', () => {
    const out = parseOutline('graph TD\n  A --> B');
    expect(out[0]).toMatchObject({ kind: 'header', line: 1, depth: 0 });
    expect(out[0].label).toMatch(/^graph TD/);
  });

  it('captures flowchart / sequenceDiagram / classDiagram headers too', () => {
    expect(parseOutline('sequenceDiagram\n A->>B: Hi')[0].kind).toBe('header');
    expect(parseOutline('classDiagram\n class Foo')[0].kind).toBe('header');
    expect(parseOutline('flowchart LR\n A --> B')[0].kind).toBe('header');
  });

  it('skips comments and whitespace before the header', () => {
    const out = parseOutline('%% first comment\n%% second\n\n  graph TD\n A --> B');
    expect(out[0]).toMatchObject({ kind: 'header', line: 4 });
  });

  it('returns no header entry for non-Mermaid text', () => {
    const out = parseOutline('hello world\n not a diagram');
    expect(out.find((e) => e.kind === 'header')).toBeUndefined();
  });

  it('parses subgraph open/close with depth tracking', () => {
    const src = `graph TD
 subgraph outer
   A --> B
   subgraph inner
     C --> D
   end
   E --> F
 end
 G --> H`;
    const out = parseOutline(src);
    const subs = out.filter((e) => e.kind === 'subgraph');
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({ label: 'outer', depth: 0 });
    expect(subs[1]).toMatchObject({ label: 'inner', depth: 1 });
  });

  it('parses quoted subgraph names', () => {
    const out = parseOutline('graph TD\n subgraph "My Cluster"\n A\n end');
    const sub = out.find((e) => e.kind === 'subgraph');
    expect(sub?.label).toBe('My Cluster');
  });

  it('captures node declarations with labels', () => {
    const out = parseOutline('graph TD\n  A[Start] --> B{Decision}');
    const nodes = out.filter((e) => e.kind === 'node');
    expect(nodes).toHaveLength(2);
    expect(nodes[0].label).toBe('A — Start');
    expect(nodes[1].label).toBe('B — Decision');
  });

  it('deduplicates nodes across edges', () => {
    const out = parseOutline('graph TD\n A[Start] --> B\n B --> A');
    const aEntries = out.filter((e) => e.kind === 'node' && e.label.startsWith('A'));
    expect(aEntries).toHaveLength(1);
  });

  it('captures bare-edge source ids when no explicit shape', () => {
    const out = parseOutline('graph TD\n  foo --> bar\n  foo --> baz');
    const nodes = out.filter((e) => e.kind === 'node');
    expect(nodes.map((n) => n.label)).toEqual(['foo']);
  });

  it('parses sequence participants (both styles + "as" clause)', () => {
    const src = `sequenceDiagram
  participant Alice
  participant "Bob Smith"
  actor C as Charlie`;
    const out = parseOutline(src);
    const participants = out.filter((e) => e.kind === 'participant');
    expect(participants.map((p) => p.label)).toEqual(['Alice', 'Bob Smith', 'C']);
  });

  it('parses class diagram class definitions', () => {
    const out = parseOutline('classDiagram\n class Animal\n class Dog { +bark() }');
    const classes = out.filter((e) => e.kind === 'class');
    expect(classes.map((c) => c.label)).toEqual(['Animal', 'Dog']);
  });

  it('`end` without matching subgraph is clamped to depth 0', () => {
    // Stray `end` shouldn't make depth go negative.
    const out = parseOutline('graph TD\n end\n A --> B');
    const nodes = out.filter((e) => e.kind === 'node');
    expect(nodes.every((n) => n.depth >= 0)).toBe(true);
  });

  it('ignores comment lines inside the body', () => {
    const out = parseOutline('graph TD\n  %% note\n  A[Start] --> B[End]');
    // With explicit shapes, both A and B are captured (2 nodes).
    expect(out.filter((e) => e.kind === 'node').length).toBe(2);
    // The %% line must not have become a node/subgraph entry.
    expect(out.find((e) => e.label.includes('%%'))).toBeUndefined();
  });
});
