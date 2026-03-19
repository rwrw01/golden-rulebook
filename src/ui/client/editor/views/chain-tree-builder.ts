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

const MAX_CHILDREN_PER_GROUP = 15;

export function buildChainTree(
  nodes: GNode[],
  edges: GEdge[],
  rootId: string,
): ChainNode {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const rootNode = nodeMap.get(rootId);

  // Group edges by relation type, collecting unique "other" nodes
  const groups = new Map<string, Map<string, GNode>>();
  for (const e of edges) {
    const otherId = e.source === rootId ? e.target : e.source;
    if (otherId === rootId) continue;
    const other = nodeMap.get(otherId);
    if (!other) continue;
    if (!groups.has(e.type)) groups.set(e.type, new Map());
    groups.get(e.type)!.set(otherId, other);
  }

  // Sort groups: most children first
  const sorted = [...groups.entries()].sort((a, b) => b[1].size - a[1].size);

  const children: ChainNode[] = sorted.map(([relType, nodeMap2]) => {
    const groupNodes = [...nodeMap2.values()];
    const capped = groupNodes.length > MAX_CHILDREN_PER_GROUP;
    const visible = capped ? groupNodes.slice(0, MAX_CHILDREN_PER_GROUP) : groupNodes;
    const remaining = groupNodes.length - visible.length;

    const kids: ChainNode[] = visible.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      expandable: true,
      loaded: false,
    }));

    if (capped) {
      kids.push({
        id: `_more_${rootId}_${relType}`,
        title: `... en nog ${remaining} meer`,
        type: '_overflow',
        expandable: false,
        loaded: true,
      });
    }

    const label = RELATION_LABELS[relType] ?? relType;
    const countLabel = `${label} (${groupNodes.length})`;

    return {
      id: `_rel_${rootId}_${relType}`,
      title: countLabel,
      type: '_relation',
      relationType: relType,
      expandable: false,
      loaded: true,
      children: kids,
    };
  });

  return {
    id: rootId,
    title: rootNode?.title ?? rootId,
    type: rootNode?.type ?? '',
    expandable: children.length > 0,
    loaded: true,
    children,
  };
}
