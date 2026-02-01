/**
 * Delta Hash - Detects DOM Changes for Bandwidth Optimization (V3 Advanced)
 * 
 * PROBLEM SOLVED:
 * Sending the JSON tree (even a small one) every 2 seconds consumes bandwidth 
 * and tokens if the page hasn't changed much. This wastes API costs for steps
 * like "typing" where the DOM structure stays the same.
 * 
 * SOLUTION:
 * Implement a hash-based check. Only send the full tree if the UI has 
 * materially changed. Otherwise, send a "no_change" heartbeat.
 * 
 * USAGE:
 * ```typescript
 * const tree = await getSemanticTree();
 * const shouldSend = await shouldSendTree(tree);
 * 
 * if (!shouldSend) {
 *   return sendHeartbeat({ status: "no_change" });
 * }
 * return sendPayload({ dom: tree });
 * ```
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import { SemanticNodeV3, SemanticTreeResultV3 } from '../pages/Content/semanticTree';

/** Last hash of the semantic tree */
let lastTreeHash = '';

/** Last tree timestamp */
let lastTreeTime = 0;

/** Minimum time between tree sends (2 seconds) */
const MIN_TREE_INTERVAL_MS = 2000;

/** Threshold for "significant" change (number of nodes that differ) */
const SIGNIFICANT_CHANGE_THRESHOLD = 3;

/**
 * Simple string hash using djb2 algorithm
 * Fast and sufficient for change detection (not cryptographic)
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Compute a hash of the semantic tree for change detection
 * Only includes the fields that matter for action targeting
 */
export function computeTreeHash(tree: SemanticTreeResultV3): string {
  // Create a minimal representation for hashing
  // Include: IDs, roles, names, values (things that affect action targeting)
  const minimalTree = tree.interactive_tree.map(node => ({
    i: node.i,
    r: node.r,
    n: node.n,
    v: node.v,
    s: node.s,
  }));
  
  const treeString = JSON.stringify(minimalTree);
  return djb2Hash(treeString);
}

/**
 * Check if the semantic tree has changed significantly
 * Returns true if the tree should be sent to the backend
 * 
 * @param tree - Current semantic tree
 * @param force - Force sending even if unchanged
 * @returns true if tree should be sent, false if it can be skipped
 */
export function hasTreeChanged(tree: SemanticTreeResultV3, force = false): boolean {
  // Force send if requested
  if (force) {
    const newHash = computeTreeHash(tree);
    lastTreeHash = newHash;
    lastTreeTime = Date.now();
    return true;
  }
  
  // Compute current hash
  const currentHash = computeTreeHash(tree);
  
  // Check if hash changed
  if (currentHash !== lastTreeHash) {
    lastTreeHash = currentHash;
    lastTreeTime = Date.now();
    return true;
  }
  
  // Check minimum interval
  const timeSinceLastSend = Date.now() - lastTreeTime;
  if (timeSinceLastSend >= MIN_TREE_INTERVAL_MS) {
    // Even if hash is same, send periodically for heartbeat
    lastTreeTime = Date.now();
    return true;
  }
  
  return false;
}

/**
 * Compare two semantic trees and count differences
 * Useful for detailed change analysis
 */
export function countTreeDifferences(
  oldTree: SemanticNodeV3[],
  newTree: SemanticNodeV3[]
): {
  added: number;
  removed: number;
  changed: number;
  total: number;
} {
  const oldIds = new Set(oldTree.map(n => n.i));
  const newIds = new Set(newTree.map(n => n.i));
  
  // Count added nodes (in new but not in old)
  const added = newTree.filter(n => !oldIds.has(n.i)).length;
  
  // Count removed nodes (in old but not in new)
  const removed = oldTree.filter(n => !newIds.has(n.i)).length;
  
  // Count changed nodes (same ID but different content)
  const oldMap = new Map(oldTree.map(n => [n.i, n]));
  let changed = 0;
  for (const newNode of newTree) {
    const oldNode = oldMap.get(newNode.i);
    if (oldNode) {
      // Compare meaningful fields
      if (oldNode.n !== newNode.n || 
          oldNode.v !== newNode.v || 
          oldNode.s !== newNode.s) {
        changed++;
      }
    }
  }
  
  return {
    added,
    removed,
    changed,
    total: added + removed + changed,
  };
}

/**
 * Check if tree changes are "significant" (worth sending)
 * Minor changes like cursor blink or hover states can be ignored
 */
export function isSignificantChange(
  oldTree: SemanticNodeV3[],
  newTree: SemanticNodeV3[]
): boolean {
  const diff = countTreeDifferences(oldTree, newTree);
  return diff.total >= SIGNIFICANT_CHANGE_THRESHOLD;
}

/**
 * Create a delta payload (only changed nodes)
 * Useful for incremental updates if backend supports it
 */
export function createDeltaPayload(
  oldTree: SemanticNodeV3[],
  newTree: SemanticNodeV3[]
): {
  added: SemanticNodeV3[];
  removed: string[];  // IDs of removed nodes
  changed: SemanticNodeV3[];
} {
  const oldIds = new Set(oldTree.map(n => n.i));
  const newIds = new Set(newTree.map(n => n.i));
  const oldMap = new Map(oldTree.map(n => [n.i, n]));
  
  const added = newTree.filter(n => !oldIds.has(n.i));
  const removed = oldTree.filter(n => !newIds.has(n.i)).map(n => n.i);
  
  const changed: SemanticNodeV3[] = [];
  for (const newNode of newTree) {
    const oldNode = oldMap.get(newNode.i);
    if (oldNode) {
      if (oldNode.n !== newNode.n || 
          oldNode.v !== newNode.v || 
          oldNode.s !== newNode.s) {
        changed.push(newNode);
      }
    }
  }
  
  return { added, removed, changed };
}

/**
 * Reset hash state (call when starting a new task)
 */
export function resetTreeHash(): void {
  lastTreeHash = '';
  lastTreeTime = 0;
}

/**
 * Get the last tree hash for debugging
 */
export function getLastTreeHash(): string {
  return lastTreeHash;
}

/**
 * High-level function: Should we send the tree to backend?
 * Combines hash check with interval check
 * 
 * @param tree - Current semantic tree
 * @param previousTree - Previous tree for comparison (optional)
 * @returns Object with decision and reason
 */
export function shouldSendTree(
  tree: SemanticTreeResultV3,
  previousTree?: SemanticNodeV3[]
): {
  shouldSend: boolean;
  reason: 'changed' | 'interval' | 'no_change';
  delta?: ReturnType<typeof createDeltaPayload>;
} {
  const currentHash = computeTreeHash(tree);
  
  // If hash changed, definitely send
  if (currentHash !== lastTreeHash) {
    lastTreeHash = currentHash;
    lastTreeTime = Date.now();
    
    // If we have previous tree, include delta
    const delta = previousTree 
      ? createDeltaPayload(previousTree, tree.interactive_tree)
      : undefined;
    
    return {
      shouldSend: true,
      reason: 'changed',
      delta,
    };
  }
  
  // Check interval
  const timeSinceLastSend = Date.now() - lastTreeTime;
  if (timeSinceLastSend >= MIN_TREE_INTERVAL_MS) {
    lastTreeTime = Date.now();
    return {
      shouldSend: true,
      reason: 'interval',
    };
  }
  
  // No change needed
  return {
    shouldSend: false,
    reason: 'no_change',
  };
}
