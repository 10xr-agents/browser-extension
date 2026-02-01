/**
 * Distributed DOM Aggregator (V2)
 * 
 * This module aggregates DOM extraction results from multiple frames (main page + iframes).
 * Since content scripts run in each frame separately (with all_frames: true), we need
 * to coordinate extraction across all frames and stitch results together.
 * 
 * Key Concepts:
 * - Main frame has frameId = 0
 * - Iframes have incrementing frameIds
 * - Each frame runs its own tagger and extractor
 * - Background script aggregates results
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import type { SemanticNode } from '../pages/Content/semanticTree';

/**
 * Result from a single frame's extraction
 */
export interface FrameExtractionResult {
  /** Frame ID (0 = main frame) */
  frameId: number;
  
  /** Frame URL */
  frameUrl: string;
  
  /** Whether this is the main frame */
  isMainFrame: boolean;
  
  /** Extracted semantic nodes from this frame */
  nodes: SemanticNode[];
  
  /** Extraction metadata */
  meta: {
    elementCount: number;
    extractionTimeMs: number;
    inShadowCount: number;
  };
  
  /** Error if extraction failed */
  error?: string;
}

/**
 * Aggregated result from all frames
 */
export interface AggregatedDomResult {
  /** Combined nodes from all frames */
  nodes: SemanticNode[];
  
  /** Page URL (main frame) */
  url: string;
  
  /** Page title (main frame) */
  title: string;
  
  /** Total element count across all frames */
  totalElements: number;
  
  /** Number of frames extracted */
  frameCount: number;
  
  /** Individual frame results */
  frames: FrameExtractionResult[];
  
  /** Aggregation metadata */
  meta: {
    totalExtractionTimeMs: number;
    mainFrameElements: number;
    iframeElements: number;
    shadowDomElements: number;
  };
}

/**
 * Extract DOM from all frames in a tab and aggregate results.
 * This runs in the background script context.
 * 
 * @param tabId - The tab to extract from
 * @returns Aggregated DOM result from all frames
 */
export async function extractFromAllFrames(tabId: number): Promise<AggregatedDomResult> {
  const startTime = performance.now();
  
  try {
    // Execute extraction in ALL frames using chrome.scripting
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: extractLocalFrame,
    });
    
    // Process results
    const frames: FrameExtractionResult[] = [];
    let mainFrameUrl = '';
    let mainFrameTitle = '';
    let totalElements = 0;
    let mainFrameElements = 0;
    let iframeElements = 0;
    let shadowDomElements = 0;
    
    // Assign frame IDs and process results
    results.forEach((result, index) => {
      if (result.result) {
        const frameResult: FrameExtractionResult = {
          frameId: index,
          frameUrl: result.result.url || '',
          isMainFrame: index === 0,
          nodes: result.result.nodes || [],
          meta: {
            elementCount: result.result.nodes?.length || 0,
            extractionTimeMs: result.result.extractionTimeMs || 0,
            inShadowCount: result.result.inShadowCount || 0,
          },
        };
        
        // Update frame ID in nodes
        frameResult.nodes.forEach(node => {
          node.frameId = index;
        });
        
        frames.push(frameResult);
        totalElements += frameResult.meta.elementCount;
        shadowDomElements += frameResult.meta.inShadowCount;
        
        if (index === 0) {
          mainFrameUrl = frameResult.frameUrl;
          mainFrameTitle = result.result.title || '';
          mainFrameElements = frameResult.meta.elementCount;
        } else {
          iframeElements += frameResult.meta.elementCount;
        }
      } else if (result.error) {
        frames.push({
          frameId: index,
          frameUrl: '',
          isMainFrame: index === 0,
          nodes: [],
          meta: { elementCount: 0, extractionTimeMs: 0, inShadowCount: 0 },
          error: result.error.message || 'Unknown error',
        });
      }
    });
    
    // Combine all nodes with unique IDs across frames
    const allNodes: SemanticNode[] = [];
    let globalIdCounter = 1;
    
    frames.forEach(frame => {
      frame.nodes.forEach(node => {
        // Create globally unique ID by prefixing with frame ID
        const globalId = frame.frameId === 0 
          ? node.id 
          : `f${frame.frameId}_${node.id}`;
        
        allNodes.push({
          ...node,
          id: globalId,
          frameId: frame.frameId,
        });
        globalIdCounter++;
      });
    });
    
    const totalExtractionTimeMs = Math.round(performance.now() - startTime);
    
    console.log(`[DomAggregator] Extracted ${totalElements} elements from ${frames.length} frames in ${totalExtractionTimeMs}ms`);
    
    return {
      nodes: allNodes,
      url: mainFrameUrl,
      title: mainFrameTitle,
      totalElements,
      frameCount: frames.length,
      frames,
      meta: {
        totalExtractionTimeMs,
        mainFrameElements,
        iframeElements,
        shadowDomElements,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[DomAggregator] Failed to extract from all frames:', errorMessage);
    
    // Return empty result on error
    return {
      nodes: [],
      url: '',
      title: '',
      totalElements: 0,
      frameCount: 0,
      frames: [],
      meta: {
        totalExtractionTimeMs: Math.round(performance.now() - startTime),
        mainFrameElements: 0,
        iframeElements: 0,
        shadowDomElements: 0,
      },
    };
  }
}

/**
 * Function that runs inside each frame to extract its local DOM.
 * This is serialized and sent to chrome.scripting.executeScript.
 */
function extractLocalFrame(): {
  url: string;
  title: string;
  nodes: Array<{
    id: string;
    role: string;
    name: string;
    value?: string;
    state?: string;
    type?: string;
    placeholder?: string;
    href?: string;
    isInShadow?: boolean;
    frameId?: number;
  }>;
  extractionTimeMs: number;
  inShadowCount: number;
} {
  const startTime = performance.now();
  
  // Simple in-frame extraction (this runs in content script context)
  const LLM_ID_ATTR = 'data-llm-id';
  const SHADOW_ATTR = 'data-llm-in-shadow';
  
  const nodes: Array<{
    id: string;
    role: string;
    name: string;
    value?: string;
    state?: string;
    type?: string;
    placeholder?: string;
    href?: string;
    isInShadow?: boolean;
    frameId?: number;
  }> = [];
  
  let inShadowCount = 0;
  
  // Find all tagged elements
  const elements = document.querySelectorAll(`[${LLM_ID_ATTR}]`);
  
  elements.forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    
    // Check visibility
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return;
    }
    
    const id = el.getAttribute(LLM_ID_ATTR);
    if (!id) return;
    
    const isInShadow = el.getAttribute(SHADOW_ATTR) === 'true';
    if (isInShadow) inShadowCount++;
    
    // Get name
    let name = el.getAttribute('aria-label') || 
               el.innerText || 
               el.getAttribute('placeholder') || 
               el.getAttribute('title') || 
               el.getAttribute('name') || 
               el.tagName.toLowerCase();
    name = name.replace(/\s+/g, ' ').trim().substring(0, 100);
    
    // Get role
    let role = el.getAttribute('role') || el.tagName.toLowerCase();
    if (role === 'a') role = 'link';
    if (el.tagName === 'INPUT') {
      const inputType = (el as HTMLInputElement).type || 'text';
      if (inputType === 'checkbox') role = 'checkbox';
      else if (inputType === 'radio') role = 'radio';
      else if (inputType === 'submit' || inputType === 'button') role = 'button';
      else role = 'textbox';
    }
    
    // Get value
    let value: string | undefined;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      value = (el as HTMLInputElement | HTMLTextAreaElement).value;
    }
    if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      value = select.options[select.selectedIndex]?.text;
    }
    
    // Get state
    const states: string[] = [];
    if ((el as HTMLInputElement).disabled) states.push('disabled');
    if ((el as HTMLInputElement).checked) states.push('checked');
    if ((el as HTMLOptionElement).selected) states.push('selected');
    if (el.getAttribute('aria-expanded') === 'true') states.push('expanded');
    
    nodes.push({
      id,
      role,
      name: name || role,
      value: value || undefined,
      state: states.length > 0 ? states.join(',') : undefined,
      type: el.tagName === 'INPUT' ? (el as HTMLInputElement).type : undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      href: el.tagName === 'A' ? (el as HTMLAnchorElement).href : undefined,
      isInShadow,
    });
  });
  
  return {
    url: window.location.href,
    title: document.title,
    nodes,
    extractionTimeMs: Math.round(performance.now() - startTime),
    inShadowCount,
  };
}

/**
 * Quick extraction from main frame only (for backward compatibility)
 */
export async function extractFromMainFrame(tabId: number): Promise<FrameExtractionResult> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: extractLocalFrame,
    });
    
    if (results[0]?.result) {
      return {
        frameId: 0,
        frameUrl: results[0].result.url,
        isMainFrame: true,
        nodes: results[0].result.nodes,
        meta: {
          elementCount: results[0].result.nodes.length,
          extractionTimeMs: results[0].result.extractionTimeMs,
          inShadowCount: results[0].result.inShadowCount,
        },
      };
    }
    
    throw new Error('No result from main frame');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      frameId: 0,
      frameUrl: '',
      isMainFrame: true,
      nodes: [],
      meta: { elementCount: 0, extractionTimeMs: 0, inShadowCount: 0 },
      error: errorMessage,
    };
  }
}
