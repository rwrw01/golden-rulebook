import { RELATION_LABELS } from '../../shared/graph-constants.js';

export interface ChainNode {
  id: string;
  title: string;
  type: string;
  relationType?: string;
  expandable: boolean;
  loaded: boolean;
  children?: ChainNode[];
}

interface GNode { id: string; title: string; type: string }
interface GEdge { source: string; target: string; label: string; type: string }

export function buildChainTree(
  nodes: GNode[],
  edges: GEdge[],
  rootId: string,
): ChainNode {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const rootNode = nodeMap.get(rootId);

  // Group edges by relation type, collecting the "other" node
  const groups = new Map<string, GNode[]>();
  for (const e of edges) {
    const otherId = e.source === rootId ? e.target : e.source;
    if (otherId === rootId) continue;
    const other = nodeMap.get(otherId);
    if (!other) continue;
    if (!groups.has(e.type)) groups.set(e.type, []);
    groups.get(e.type)!.push(other);
  }

  // Sort groups: most children first
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const children: ChainNode[] = sorted.map(([relType, groupNodes]) => ({
    id: `_rel_${rootId}_${relType}`,
    title: RELATION_LABELS[relType] ?? relType,
    type: '_relation',
    relationType: relType,
    expandable: false,
    loaded: true,
    children: groupNodes.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      expandable: true,
      loaded: false,
    })),
  }));

  return {
    id: rootId,
    title: rootNode?.title ?? rootId,
    type: rootNode?.type ?? '',
    expandable: children.length > 0,
    loaded: true,
    children,
  };
}
