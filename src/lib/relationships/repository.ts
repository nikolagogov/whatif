import contentGraph from '../../data/content-graph.json';

/**
 * Canonical read-only access to Content Graph relationships.
 * This layer deliberately does not infer, rewrite, or create relationships.
 */
export type GraphNode = {
  id: string;
  kind: string;
  [key: string]: unknown;
};

export type GraphEdge = {
  id?: string;
  type: string;
  from: string;
  to: string;
  article?: string;
  evidence?: string;
  [key: string]: unknown;
};

export type ContentGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const graph = contentGraph as ContentGraph;
const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
const edgesByType = new Map<string, GraphEdge[]>();
const incomingByNode = new Map<string, GraphEdge[]>();
const outgoingByNode = new Map<string, GraphEdge[]>();
const edgesByArticle = new Map<string, GraphEdge[]>();

function append<T>(index: Map<string, T[]>, key: string, value: T): void {
  const values = index.get(key);
  if (values) values.push(value);
  else index.set(key, [value]);
}

for (const edge of graph.edges) {
  append(edgesByType, edge.type, edge);
  append(incomingByNode, edge.to, edge);
  append(outgoingByNode, edge.from, edge);
  if (typeof edge.article === 'string') {
    append(edgesByArticle, edge.article, edge);
  }
}

/** Returns the generated graph without changing its nodes or edges. */
export function getContentGraph(): ContentGraph {
  return graph;
}

export function getAllRelationshipEdges(): GraphEdge[] {
  return graph.edges;
}

export function getRelationshipTypes(): string[] {
  return [...edgesByType.keys()];
}

export function getRelationshipEdgesByType(type: string): GraphEdge[] {
  return edgesByType.get(type) ?? [];
}

export function getIncomingRelationships(nodeId: string): GraphEdge[] {
  return incomingByNode.get(nodeId) ?? [];
}

export function getOutgoingRelationships(nodeId: string): GraphEdge[] {
  return outgoingByNode.get(nodeId) ?? [];
}

export function getRelationshipsForNode(nodeId: string): GraphEdge[] {
  return [
    ...getIncomingRelationships(nodeId),
    ...getOutgoingRelationships(nodeId),
  ];
}

export function getRelationshipsBetween(
  fromNodeId: string,
  toNodeId: string,
  type?: string,
): GraphEdge[] {
  const outgoing = getOutgoingRelationships(fromNodeId);
  return outgoing.filter(edge =>
    edge.to === toNodeId && (!type || edge.type === type)
  );
}

export function getRelationshipsByArticle(articleNodeId: string): GraphEdge[] {
  return edgesByArticle.get(articleNodeId) ?? [];
}

export function getGraphNode(nodeId: string): GraphNode | undefined {
  return nodesById.get(nodeId);
}

export function getGraphNodes(): GraphNode[] {
  return graph.nodes;
}
