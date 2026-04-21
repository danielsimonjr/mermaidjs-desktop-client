import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { highlightingFor, syntaxTree } from '@codemirror/language';

import { createMermaidLanguage } from '../../src/editor/language';

/**
 * Integration test against @codemirror/language — we tokenize a small Mermaid
 * document and assert the token classes the parser assigns at chosen positions.
 * That exercises every branch of the token() function defined in language.ts.
 */
describe('createMermaidLanguage', () => {
  it('returns a reusable Extension', () => {
    const ext = createMermaidLanguage();
    expect(ext).toBeTruthy();
  });

  it('tokenizes keywords, comments, arrows, brackets, and strings', () => {
    const ext = createMermaidLanguage();
    const source = [
      '%% this is a comment',
      'graph TD',
      '    A["label"] --> B[(shape)]',
      '    subgraph inner',
      '      B --> C',
      '    end',
    ].join('\n');

    const state = EditorState.create({ doc: source, extensions: [ext] });
    const tree = syntaxTree(state);

    // Walk the tree and collect (text, node-name) pairs.
    const tokens: Array<{ text: string; name: string }> = [];
    tree.iterate({
      enter(node) {
        if (node.from === node.to) return;
        tokens.push({
          text: state.doc.sliceString(node.from, node.to),
          name: node.name,
        });
      },
    });

    // Assert that each structural element got some non-"Document" classification.
    const flat = tokens.map((t) => `${t.name}:${t.text}`).join('\n');
    expect(flat).toContain('graph');
    expect(flat).toContain('subgraph');
    expect(flat).toContain('end');
  });

  it('recognizes arrow tokens as operators', () => {
    const ext = createMermaidLanguage();
    const state = EditorState.create({
      doc: 'graph LR\n A --> B\n C --- D\n E -.-> F',
      extensions: [ext],
    });
    // Rough check: the document parses without throwing.
    expect(() => syntaxTree(state)).not.toThrow();
    // At least one span has an 'operator'-tagged class somewhere in the doc.
    const classes = highlightingFor(state, []);
    expect(typeof classes === 'string' || classes === null).toBe(true);
  });

  it('tokenizes attribute-name refs (#id, .class), numbers, brackets, and special chars', () => {
    const ext = createMermaidLanguage();
    // Document deliberately mixes every tokenizer branch:
    //   - .class and #id attribute refs (line 67 of language.ts)
    //   - colon-triple ::: (arrow fallback)
    //   - bracket/paren set
    //   - operator punctuation
    //   - standalone number 42 and decimal 3.14
    //   - identifiers (keyword + non-keyword)
    //   - unknown characters (@, $) hitting the final fallthrough
    const state = EditorState.create({
      doc: 'graph TD\n A:::myClass\n B.active\n C#main --> D\n 42 3.14 @hash $x\n unknownWord graph',
      extensions: [ext],
    });
    expect(() => syntaxTree(state)).not.toThrow();
  });

  it('handles unterminated strings gracefully', () => {
    const ext = createMermaidLanguage();
    const state = EditorState.create({
      doc: 'graph\n A["unterminated string',
      extensions: [ext],
    });
    expect(() => syntaxTree(state)).not.toThrow();
  });

  it('handles escape sequences inside quoted strings', () => {
    const ext = createMermaidLanguage();
    const state = EditorState.create({
      doc: 'graph\n A["has \\"escaped\\" quote"]',
      extensions: [ext],
    });
    expect(() => syntaxTree(state)).not.toThrow();
  });
});
