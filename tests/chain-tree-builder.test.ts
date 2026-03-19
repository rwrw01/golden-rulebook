import { describe, it, expect } from 'vitest';
import { buildChainTree } from '../src/ui/client/editor/views/chain-tree-builder.js';

describe('buildChainTree', () => {
  it('should group children by relation type', () => {
    const nodes = [
      { id: 'root', title: 'Powerbrowser', type: 'Applicatie' },
      { id: 'n1', title: 'SRV-01', type: 'Node' },
      { id: 'n2', title: 'DB-01', type: 'Database' },
      { id: 'n3', title: 'Zaakafhandeling', type: 'Bedrijfsproces' },
    ];
    const edges = [
      { source: 'root', target: 'n1', label: '', type: 'composition' },
      { source: 'root', target: 'n2', label: '', type: 'access' },
      { source: 'n3', target: 'root', label: '', type: 'usedby' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');

    expect(tree.id).toBe('root');
    expect(tree.title).toBe('Powerbrowser');
    expect(tree.children).toHaveLength(3);
    const relTypes = tree.children!.map(c => c.relationType);
    expect(relTypes).toContain('composition');
    expect(relTypes).toContain('access');
    expect(relTypes).toContain('usedby');
  });

  it('should mark leaf nodes as expandable (unknown children)', () => {
    const nodes = [
      { id: 'root', title: 'App', type: 'Applicatie' },
      { id: 'n1', title: 'Server', type: 'Node' },
    ];
    const edges = [
      { source: 'root', target: 'n1', label: '', type: 'composition' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');
    const leaf = tree.children![0].children![0];
    expect(leaf.expandable).toBe(true);
    expect(leaf.loaded).toBe(false);
  });

  it('should wrap single relation type in group node', () => {
    const nodes = [
      { id: 'root', title: 'App', type: 'Applicatie' },
      { id: 'n1', title: 'Server', type: 'Node' },
    ];
    const edges = [
      { source: 'root', target: 'n1', label: '', type: 'composition' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');
    expect(tree.children).toHaveLength(1);
    expect(tree.children![0].relationType).toBe('composition');
    expect(tree.children![0].children).toHaveLength(1);
  });

  it('should return childless root for empty graph', () => {
    const tree = buildChainTree(
      [{ id: 'root', title: 'Lonely', type: 'Applicatie' }],
      [],
      'root',
    );
    expect(tree.children).toHaveLength(0);
    expect(tree.expandable).toBe(false);
  });

  it('should ignore self-referencing edges', () => {
    const nodes = [
      { id: 'root', title: 'App', type: 'Applicatie' },
    ];
    const edges = [
      { source: 'root', target: 'root', label: '', type: 'association' },
    ];

    const tree = buildChainTree(nodes, edges, 'root');
    expect(tree.children).toHaveLength(0);
  });
});
