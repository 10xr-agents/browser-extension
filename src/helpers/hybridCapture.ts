/**
 * Hybrid Capture - Page State Capture Coordination
 * 
 * Coordinates capturing screenshot, skeleton DOM, and full DOM in parallel.
 * Selects optimal processing mode based on query and page context.
 * 
 * Reference: HYBRID_VISION_SKELETON_EXTENSION_SPEC.md §3, §4
 */

import { captureAndOptimizeScreenshot, resetScreenshotHashCache, type ScreenshotResult } from './screenshotCapture';
import { extractSkeletonDom, getSkeletonStats, type SkeletonStats } from './skeletonDom';
import { getSimplifiedDom, type SimplifiedDomResult } from './simplifyDom';

/**
 * Processing mode for hybrid payload
 */
export type DomMode = 'skeleton' | 'full' | 'hybrid';

/**
 * Page context for mode selection
 */
export interface PageContext {
  interactiveElementCount: number;
  pageComplexity?: 'simple' | 'medium' | 'complex';
  hasVisualElements?: boolean;
}

/**
 * Result of hybrid page state capture
 */
export interface HybridPageState {
  /** Base64-encoded JPEG screenshot (null if unchanged) */
  screenshot: string | null;
  /** Perceptual hash of screenshot */
  screenshotHash: string | null;
  /** Screenshot metadata (null if screenshot not captured) */
  screenshotMeta: {
    width: number;
    height: number;
    sizeBytes: number;
  } | null;
  /** Skeleton DOM containing only interactive elements */
  skeletonDom: string;
  /** Skeleton statistics */
  skeletonStats: SkeletonStats;
  /** Full DOM (for backward compatibility / fallback) */
  dom: string;
  /** Full simplified DOM result with metadata */
  domResult: SimplifiedDomResult;
  /** Selected processing mode */
  domMode: DomMode;
  /** Capture timing in ms */
  captureTimeMs: number;
}

/**
 * Options for hybrid capture
 */
export interface HybridCaptureOptions {
  /** User query for mode selection */
  query?: string;
  /** Force specific mode (overrides auto-selection) */
  forceMode?: DomMode;
  /** Skip screenshot capture (for quick iterations) */
  skipScreenshot?: boolean;
  /** Tab ID for DOM extraction */
  tabId?: number;
}

/**
 * Capture complete page state for hybrid processing.
 * 
 * Captures screenshot, skeleton DOM, and full DOM in parallel.
 * Selects optimal processing mode based on query and page context.
 * 
 * @param options - Capture options
 * @returns Complete hybrid page state
 */
export async function captureHybridPageState(
  options: HybridCaptureOptions = {}
): Promise<HybridPageState> {
  const startTime = performance.now();
  const { query = '', forceMode, skipScreenshot = false, tabId } = options;

  // Capture screenshot and DOM in parallel
  const [screenshotResult, domResult] = await Promise.all([
    skipScreenshot 
      ? Promise.resolve(null) 
      : captureAndOptimizeScreenshot().catch((err) => {
          console.warn('[HybridCapture] Screenshot capture failed:', err);
          return null;
        }),
    getSimplifiedDom(tabId),
  ]);

  // Extract skeleton from full DOM
  const skeletonDom = extractSkeletonDom(domResult.dom);
  const skeletonStats = getSkeletonStats(domResult.dom.length, skeletonDom);

  // Build page context for mode selection
  const pageContext: PageContext = {
    interactiveElementCount: skeletonStats.interactiveCount,
    pageComplexity: categorizePageComplexity(skeletonStats.interactiveCount),
    hasVisualElements: checkHasVisualElements(domResult.dom),
  };

  // Select processing mode
  const domMode = forceMode || selectDomMode(query, pageContext);

  const captureTimeMs = Math.round(performance.now() - startTime);

  console.log('[HybridCapture] Page state captured:', {
    domMode,
    screenshotCaptured: screenshotResult !== null,
    skeletonLength: skeletonDom.length,
    fullDomLength: domResult.dom.length,
    compressionRatio: `${skeletonStats.compressionRatio}%`,
    interactiveElements: skeletonStats.interactiveCount,
    captureTimeMs,
  });

  return {
    screenshot: screenshotResult?.base64 || null,
    screenshotHash: screenshotResult?.hash || null,
    screenshotMeta: screenshotResult ? {
      width: screenshotResult.width,
      height: screenshotResult.height,
      sizeBytes: screenshotResult.sizeBytes,
    } : null,
    skeletonDom,
    skeletonStats,
    dom: domResult.dom,
    domResult,
    domMode,
    captureTimeMs,
  };
}

/**
 * Select optimal DOM processing mode based on query and page context.
 * 
 * Mode selection logic:
 * - "hybrid": Visual queries, spatial references, complex layouts
 * - "skeleton": Simple text-based actions
 * - "full": Fallback when skeleton insufficient
 */
export function selectDomMode(query: string, pageContext: PageContext): DomMode {
  const lowerQuery = query.toLowerCase();

  // Visual indicators - use hybrid mode
  const VISUAL_KEYWORDS = [
    // Visual elements
    'icon', 'image', 'logo', 'picture', 'photo', 'avatar',
    // Appearance
    'looks like', 'appears', 'color', 'shape', 'blue', 'red', 'green',
    // Spatial references
    'top', 'bottom', 'left', 'right', 'corner', 'side', 'edge',
    'next to', 'above', 'below', 'beside', 'near', 'between',
    'first', 'second', 'third', 'last', 'middle',
    // Visual queries
    'what is', 'what does', 'how much', 'price', 'see', 'show',
    'chart', 'graph', 'table', 'grid', 'card', 'thumbnail',
  ];

  if (VISUAL_KEYWORDS.some(kw => lowerQuery.includes(kw))) {
    return 'hybrid';
  }

  // Complex page with many similar elements - use hybrid for disambiguation
  if (pageContext.interactiveElementCount > 50) {
    return 'hybrid';
  }

  // If page has significant visual content and query is ambiguous
  if (pageContext.hasVisualElements && pageContext.pageComplexity === 'complex') {
    return 'hybrid';
  }

  // Simple text-based action - skeleton only
  const SIMPLE_ACTIONS = [
    'click', 'type', 'fill', 'select', 'enter', 'press', 'submit',
    'check', 'uncheck', 'toggle', 'expand', 'collapse', 'open', 'close',
    'scroll', 'navigate', 'go to', 'search', 'find',
  ];

  if (SIMPLE_ACTIONS.some(action => lowerQuery.includes(action))) {
    return 'skeleton';
  }

  // Medium complexity - use skeleton as it's usually sufficient
  if (pageContext.pageComplexity === 'medium') {
    return 'skeleton';
  }

  // Default to skeleton for efficiency
  return 'skeleton';
}

/**
 * Categorize page complexity based on interactive element count.
 */
function categorizePageComplexity(interactiveCount: number): PageContext['pageComplexity'] {
  if (interactiveCount <= 20) return 'simple';
  if (interactiveCount <= 50) return 'medium';
  return 'complex';
}

/**
 * Check if DOM has significant visual elements (images, SVGs, etc.)
 */
function checkHasVisualElements(dom: string): boolean {
  // Quick heuristic check
  const visualPatterns = [
    /<img/gi,
    /<svg/gi,
    /<canvas/gi,
    /background-image/gi,
    /\.jpg|\.png|\.gif|\.webp|\.svg/gi,
  ];

  let visualCount = 0;
  for (const pattern of visualPatterns) {
    const matches = dom.match(pattern);
    if (matches) {
      visualCount += matches.length;
    }
  }

  return visualCount > 5; // Threshold for "significant" visual content
}

/**
 * Reset screenshot cache (call when starting new task).
 */
export function resetHybridCaptureCache(): void {
  resetScreenshotHashCache();
}

/**
 * Quick capture for iterative loops (skeleton only, no screenshot).
 * Used when screenshot is unlikely to have changed.
 */
export async function captureQuickPageState(tabId?: number): Promise<{
  skeletonDom: string;
  dom: string;
  domResult: SimplifiedDomResult;
}> {
  const domResult = await getSimplifiedDom(tabId);
  const skeletonDom = extractSkeletonDom(domResult.dom);
  
  return {
    skeletonDom,
    dom: domResult.dom,
    domResult,
  };
}

/**
 * Estimate token count for payload (rough approximation).
 * Based on: ~4 chars per token for text, ~1000 tokens per 100KB image
 */
export function estimateTokenCount(pageState: HybridPageState): {
  textTokens: number;
  imageTokens: number;
  totalTokens: number;
} {
  const textContent = pageState.domMode === 'full' 
    ? pageState.dom 
    : pageState.skeletonDom;
  
  const textTokens = Math.round(textContent.length / 4);
  const imageTokens = pageState.screenshotMeta 
    ? Math.round(pageState.screenshotMeta.sizeBytes / 100) 
    : 0;
  
  return {
    textTokens,
    imageTokens,
    totalTokens: textTokens + imageTokens,
  };
}
