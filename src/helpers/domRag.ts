/**
 * DOM RAG (Retrieval-Augmented Generation) - Handles Huge Pages (Production-Grade)
 * 
 * PROBLEM SOLVED:
 * A page like Amazon search results or Wikipedia might have 5,000+ interactive elements.
 * Even optimized JSON can hit 30k+ tokens, confusing the LLM and costing $$$.
 * 
 * SOLUTION:
 * Client-side chunking + relevance scoring to pre-filter the DOM tree before sending.
 * Backend can further refine using embeddings (all-MiniLM-L6-v2, text-embedding-3-small).
 * 
 * WORKFLOW:
 * 1. Client extracts full tree
 * 2. Client chunks by container/section
 * 3. Client scores chunks by query relevance (simple keyword match)
 * 4. Client sends top N chunks to backend
 * 5. Backend can optionally re-rank with embeddings
 * 6. Filtered tree sent to LLM
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import { SemanticNodeV3 } from '../pages/Content/semanticTree';

/**
 * A chunk of DOM nodes grouped by container/section
 */
export interface DomChunk {
  /** Unique chunk ID */
  chunkId: string;
  
  /** Container element ID (if available) */
  containerId?: string;
  
  /** Container name/label */
  containerName: string;
  
  /** Nodes in this chunk */
  nodes: SemanticNodeV3[];
  
  /** Relevance score (0-1) based on query */
  relevance: number;
  
  /** Combined text for embedding/search */
  searchText: string;
  
  /** Estimated token count */
  tokenCount: number;
}

/**
 * Result of DOM filtering
 */
export interface FilteredDomResult {
  /** Filtering mode */
  mode: 'filtered';
  
  /** Why this filter was applied */
  reason: string;
  
  /** Original element count */
  originalCount: number;
  
  /** Filtered element count */
  filteredCount: number;
  
  /** Token reduction percentage */
  tokenReduction: number;
  
  /** Filtered tree */
  tree: SemanticNodeV3[];
  
  /** Chunks for backend re-ranking (optional) */
  chunks?: DomChunk[];
}

/**
 * Options for DOM filtering
 */
export interface DomFilterOptions {
  /** User query for relevance scoring */
  query: string;
  
  /** Maximum nodes to return */
  maxNodes?: number;
  
  /** Maximum tokens to return */
  maxTokens?: number;
  
  /** Minimum relevance score (0-1) */
  minRelevance?: number;
  
  /** Include chunks for backend re-ranking */
  includeChunks?: boolean;
  
  /** Prioritize certain roles */
  priorityRoles?: string[];
}

// =============================================================================
// CHUNKING LOGIC
// =============================================================================

/**
 * Common container indicators in class/role
 */
const CONTAINER_INDICATORS = [
  'section', 'container', 'wrapper', 'card', 'item', 'row', 'list',
  'header', 'footer', 'nav', 'sidebar', 'main', 'content', 'form',
  'product', 'result', 'article', 'post', 'comment', 'review',
];

/**
 * Chunk DOM nodes by spatial proximity and role patterns
 * 
 * Strategy:
 * 1. Group nodes that are spatially close (within 200px vertically)
 * 2. Respect natural containers (forms, cards, sections)
 * 3. Keep related items together (e.g., product + price + cart button)
 */
export function chunkDomNodes(nodes: SemanticNodeV3[]): DomChunk[] {
  if (nodes.length === 0) return [];
  
  // Sort by Y coordinate for spatial grouping
  const sortedNodes = [...nodes].sort((a, b) => {
    const yA = a.xy?.[1] ?? 0;
    const yB = b.xy?.[1] ?? 0;
    return yA - yB;
  });
  
  const chunks: DomChunk[] = [];
  let currentChunk: SemanticNodeV3[] = [];
  let currentChunkY = sortedNodes[0]?.xy?.[1] ?? 0;
  let chunkIndex = 0;
  
  // Group by vertical proximity (200px threshold)
  const VERTICAL_THRESHOLD = 200;
  
  for (const node of sortedNodes) {
    const nodeY = node.xy?.[1] ?? 0;
    
    // Start new chunk if far from current group
    if (currentChunk.length > 0 && nodeY - currentChunkY > VERTICAL_THRESHOLD) {
      // Save current chunk
      chunks.push(createChunk(currentChunk, chunkIndex++));
      currentChunk = [];
      currentChunkY = nodeY;
    }
    
    currentChunk.push(node);
    
    // Also split on natural boundaries (forms, large gaps)
    if (currentChunk.length >= 20) {
      chunks.push(createChunk(currentChunk, chunkIndex++));
      currentChunk = [];
      currentChunkY = nodeY;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunkIndex));
  }
  
  return chunks;
}

/**
 * Create a chunk from a group of nodes
 */
function createChunk(nodes: SemanticNodeV3[], index: number): DomChunk {
  // Find the most likely container name
  const containerName = inferContainerName(nodes);
  
  // Build search text from all node names/values
  const searchText = nodes
    .map(n => `${n.n || ''} ${n.v || ''}`.trim())
    .filter(Boolean)
    .join(' ');
  
  // Estimate tokens (roughly 4 chars per token)
  const jsonLength = JSON.stringify(nodes).length;
  const tokenCount = Math.round(jsonLength / 4);
  
  return {
    chunkId: `chunk-${index}`,
    containerName: containerName || `Section ${index + 1}`,
    nodes,
    relevance: 0, // Will be scored later
    searchText: searchText.toLowerCase(),
    tokenCount,
  };
}

/**
 * Infer a meaningful container name from nodes
 */
function inferContainerName(nodes: SemanticNodeV3[]): string {
  // Look for heading-like nodes
  for (const node of nodes) {
    if (node.r === 'h' || node.r === 'heading') {
      return node.n;
    }
  }
  
  // Look for form elements
  const hasForm = nodes.some(n => ['inp', 'input', 'textbox', 'chk', 'checkbox', 'radio', 'sel', 'select'].includes(n.r));
  if (hasForm) {
    // Try to find a label that describes the form
    const formLabels = nodes.filter(n => n.n && n.n.length > 3 && n.n.length < 50);
    if (formLabels.length > 0) {
      return `Form: ${formLabels[0].n}`;
    }
    return 'Form Section';
  }
  
  // Look for buttons (likely action area)
  const buttons = nodes.filter(n => n.r === 'btn' || n.r === 'button');
  if (buttons.length > 2) {
    return 'Action Area';
  }
  
  // Look for links (navigation area)
  const links = nodes.filter(n => n.r === 'link');
  if (links.length > 5) {
    return 'Navigation';
  }
  
  // Default based on first meaningful node
  const firstMeaningful = nodes.find(n => n.n && n.n.length > 3);
  if (firstMeaningful) {
    return firstMeaningful.n.substring(0, 30);
  }
  
  return '';
}

// =============================================================================
// RELEVANCE SCORING
// =============================================================================

/**
 * Score chunk relevance based on query
 * Simple keyword matching - backend can enhance with embeddings
 */
export function scoreChunkRelevance(chunk: DomChunk, query: string): number {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  if (queryWords.length === 0) return 0.5; // Neutral if no query
  
  let score = 0;
  const searchText = chunk.searchText;
  
  // Exact query match (high score)
  if (searchText.includes(queryLower)) {
    score += 0.5;
  }
  
  // Word matches
  for (const word of queryWords) {
    if (searchText.includes(word)) {
      score += 0.3 / queryWords.length;
    }
  }
  
  // Role-based boosting
  const hasInputs = chunk.nodes.some(n => ['inp', 'input', 'textbox'].includes(n.r));
  const hasButtons = chunk.nodes.some(n => ['btn', 'button'].includes(n.r));
  
  // Boost interactive sections
  if (hasInputs || hasButtons) {
    score += 0.1;
  }
  
  // Penalize navigation/footer chunks for action queries
  const containerLower = chunk.containerName.toLowerCase();
  if (containerLower.includes('nav') || containerLower.includes('footer')) {
    score *= 0.5;
  }
  
  return Math.min(1, Math.max(0, score));
}

/**
 * Score node relevance individually
 */
export function scoreNodeRelevance(node: SemanticNodeV3, query: string): number {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  if (queryWords.length === 0) return 0.5;
  
  let score = 0;
  const nodeName = (node.n || '').toLowerCase();
  const nodeValue = (node.v || '').toLowerCase();
  const nodeText = `${nodeName} ${nodeValue}`;
  
  // Exact match
  if (nodeText.includes(queryLower)) {
    score += 0.6;
  }
  
  // Word matches
  for (const word of queryWords) {
    if (nodeText.includes(word)) {
      score += 0.25 / queryWords.length;
    }
  }
  
  // Role boosting for actions
  if (['btn', 'button', 'link'].includes(node.r)) {
    score += 0.1;
  }
  
  return Math.min(1, Math.max(0, score));
}

// =============================================================================
// MAIN FILTERING FUNCTION
// =============================================================================

/**
 * Filter DOM tree for LLM consumption
 * 
 * Reduces token count by keeping only relevant nodes based on:
 * 1. Query relevance (keyword matching)
 * 2. Role priority (buttons, inputs preferred for actions)
 * 3. Spatial importance (visible/viewport nodes)
 * 
 * @param nodes - Full DOM tree
 * @param options - Filtering options
 * @returns Filtered result with metadata
 */
export function filterDomForQuery(
  nodes: SemanticNodeV3[],
  options: DomFilterOptions
): FilteredDomResult {
  const {
    query,
    maxNodes = 50,
    maxTokens = 2000,
    minRelevance = 0.1,
    includeChunks = false,
    priorityRoles = ['btn', 'button', 'inp', 'input', 'link'],
  } = options;
  
  const originalCount = nodes.length;
  
  // If already small, return as-is
  if (nodes.length <= maxNodes) {
    return {
      mode: 'filtered',
      reason: 'Tree already within limits',
      originalCount,
      filteredCount: nodes.length,
      tokenReduction: 0,
      tree: nodes,
    };
  }
  
  // Score all nodes
  const scoredNodes = nodes.map(node => ({
    node,
    relevance: scoreNodeRelevance(node, query),
    isPriority: priorityRoles.includes(node.r),
  }));
  
  // Sort by relevance (priority roles get a boost)
  scoredNodes.sort((a, b) => {
    const aScore = a.relevance + (a.isPriority ? 0.2 : 0);
    const bScore = b.relevance + (b.isPriority ? 0.2 : 0);
    return bScore - aScore;
  });
  
  // Filter by minimum relevance
  const relevantNodes = scoredNodes.filter(sn => 
    sn.relevance >= minRelevance || sn.isPriority
  );
  
  // Take top N nodes within token budget
  const filteredNodes: SemanticNodeV3[] = [];
  let currentTokens = 0;
  
  for (const { node } of relevantNodes) {
    const nodeTokens = Math.round(JSON.stringify(node).length / 4);
    
    if (currentTokens + nodeTokens > maxTokens && filteredNodes.length >= 10) {
      break; // Token budget exceeded (but ensure minimum of 10)
    }
    
    filteredNodes.push(node);
    currentTokens += nodeTokens;
    
    if (filteredNodes.length >= maxNodes) {
      break; // Node count limit reached
    }
  }
  
  // Calculate token reduction
  const originalTokens = Math.round(JSON.stringify(nodes).length / 4);
  const filteredTokens = Math.round(JSON.stringify(filteredNodes).length / 4);
  const tokenReduction = Math.round((1 - filteredTokens / originalTokens) * 100);
  
  const result: FilteredDomResult = {
    mode: 'filtered',
    reason: `Filtered for: "${query.substring(0, 50)}"`,
    originalCount,
    filteredCount: filteredNodes.length,
    tokenReduction,
    tree: filteredNodes,
  };
  
  // Optionally include chunks for backend re-ranking
  if (includeChunks) {
    const chunks = chunkDomNodes(nodes);
    chunks.forEach(chunk => {
      chunk.relevance = scoreChunkRelevance(chunk, query);
    });
    chunks.sort((a, b) => b.relevance - a.relevance);
    result.chunks = chunks;
  }
  
  console.log(`[DomRAG] Filtered ${originalCount} → ${filteredNodes.length} nodes (${tokenReduction}% token reduction)`);
  
  return result;
}

/**
 * Quick check if DOM needs filtering
 */
export function needsFiltering(nodes: SemanticNodeV3[], maxNodes = 100): boolean {
  return nodes.length > maxNodes;
}

/**
 * Get summary stats for large DOM
 */
export function getDomStats(nodes: SemanticNodeV3[]): {
  totalNodes: number;
  estimatedTokens: number;
  needsFiltering: boolean;
  roleBreakdown: Record<string, number>;
} {
  const roleBreakdown: Record<string, number> = {};
  
  for (const node of nodes) {
    roleBreakdown[node.r] = (roleBreakdown[node.r] || 0) + 1;
  }
  
  const estimatedTokens = Math.round(JSON.stringify(nodes).length / 4);
  
  return {
    totalNodes: nodes.length,
    estimatedTokens,
    needsFiltering: nodes.length > 100 || estimatedTokens > 3000,
    roleBreakdown,
  };
}

/**
 * Create embeddings-ready payload for backend
 * Backend can use this with text-embedding-3-small or all-MiniLM-L6-v2
 */
export function prepareForEmbeddings(nodes: SemanticNodeV3[]): Array<{
  id: string;
  text: string;
  metadata: { role: string; hasValue: boolean };
}> {
  return nodes.map(node => ({
    id: node.i,
    text: `${node.r}: ${node.n} ${node.v || ''}`.trim(),
    metadata: {
      role: node.r,
      hasValue: !!node.v,
    },
  }));
}
