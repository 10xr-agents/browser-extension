/**
 * DOM Actions Helper for Thin Client Architecture
 * 
 * Executes browser actions (click, setValue) via Chrome Debugger API.
 * Uses accessibility node mapping when available (Task 6), falls back to DOM-based targeting.
 * 
 * Reference: ACTION_SYSTEM.md
 * Reference: THIN_CLIENT_ROADMAP.md §7.1 (Task 6: Accessibility-DOM Element Mapping)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 3)
 */

import { SPADEWORKS_ELEMENT_SELECTOR } from '../constants';
import { useAppState } from '../state/store';
import { callRPC } from './pageRPC';
import { scrollScriptString } from './runtimeFunctionStrings';
import { sleep } from './utils';
import { getAXNodeIdFromElementIndex } from './accessibilityMapping';

/**
 * V3 SEMANTIC MODE: Attribute name for stable element IDs
 * Elements are tagged with data-llm-id by the tagger.ts on page load
 */
const LLM_ID_ATTR = 'data-llm-id';

/**
 * V3 ADVANCED: Self-Healing Recovery Configuration
 * When an element ID becomes stale (React/Vue re-render), we search for a "Ghost Match"
 * using role, name, and coordinates similarity
 */
interface GhostMatchConfig {
  /** Original element's name/text */
  name: string | null;
  /** Original element's role */
  role: string | null;
  /** Original element's coordinates [x, y] */
  coordinates: [number, number] | null;
  /** Whether element was interactive */
  interactive: boolean;
  /** Confidence threshold (0-1) for accepting a ghost match */
  minConfidence: number;
}

/**
 * V3 ADVANCED: Ghost Match result from self-healing recovery
 */
interface GhostMatchResult {
  /** Object ID of the recovered element */
  objectId: string;
  /** New element ID (if element was re-tagged) */
  newElementId: string | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** How the element was matched */
  matchMethod: 'text' | 'role_name' | 'coordinates' | 'combined';
}

async function sendCommand(method: string, params?: any) {
  const tabId = useAppState.getState().currentTask.tabId;
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

/**
 * V3 ADVANCED: Self-Healing Ghost Match Recovery
 * 
 * PROBLEM: Highly reactive pages (React, Vue) can destroy and recreate elements
 * between the LLM deciding to click and the command reaching the browser.
 * The ID becomes invalid, causing action failures.
 * 
 * SOLUTION: Instead of failing immediately, search for a "Ghost Match":
 * an element with the same role, name, and similar coordinates.
 * 
 * CONFIDENCE SCORING:
 * - Exact text match: +0.4
 * - Role match: +0.3
 * - Coordinates within 50px: +0.3
 * - Interactive element: +0.1 (bonus)
 * 
 * @param config - Configuration for finding ghost match
 * @returns Ghost match result or null if no match found
 */
async function findGhostMatch(config: GhostMatchConfig): Promise<GhostMatchResult | null> {
  const { name, role, coordinates, interactive, minConfidence } = config;
  
  if (!name && !role && !coordinates) {
    console.warn('[SelfHeal] No recovery info available for ghost match');
    return null;
  }
  
  try {
    // Build the search expression that runs in page context
    const searchExpression = `
      (function() {
        const searchName = ${JSON.stringify(name || '')};
        const searchRole = ${JSON.stringify(role || '')};
        const searchCoords = ${JSON.stringify(coordinates)};
        const requireInteractive = ${interactive};
        const LLM_ID_ATTR = 'data-llm-id';
        
        // Scoring function
        function scoreElement(el) {
          let score = 0;
          let matchMethod = 'combined';
          
          // Get element text/name
          const elText = (el.innerText || el.textContent || '').trim();
          const elAriaLabel = el.getAttribute('aria-label') || '';
          const elName = el.getAttribute('name') || '';
          const elTitle = el.getAttribute('title') || '';
          const elPlaceholder = el.getAttribute('placeholder') || '';
          
          // Text matching (0.4 max)
          if (searchName) {
            const searchLower = searchName.toLowerCase();
            const matchTexts = [elText, elAriaLabel, elName, elTitle, elPlaceholder]
              .map(t => t.toLowerCase());
            
            // Exact match
            if (matchTexts.some(t => t === searchLower)) {
              score += 0.4;
              matchMethod = 'text';
            }
            // Contains match
            else if (matchTexts.some(t => t.includes(searchLower) || searchLower.includes(t))) {
              score += 0.25;
            }
          }
          
          // Role matching (0.3 max)
          if (searchRole) {
            const elRole = el.getAttribute('role') || '';
            const tagRole = {
              'button': 'button',
              'a': 'link',
              'input': 'textbox',
              'select': 'listbox',
              'textarea': 'textbox',
            }[el.tagName.toLowerCase()] || '';
            
            if (elRole === searchRole || tagRole === searchRole) {
              score += 0.3;
              if (score >= 0.7) matchMethod = 'role_name';
            }
          }
          
          // Coordinate matching (0.3 max)
          if (searchCoords) {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const distance = Math.sqrt(
              Math.pow(centerX - searchCoords[0], 2) + 
              Math.pow(centerY - searchCoords[1], 2)
            );
            
            // Within 50px is excellent, up to 150px is acceptable
            if (distance < 50) {
              score += 0.3;
              if (matchMethod === 'combined' && score < 0.5) matchMethod = 'coordinates';
            } else if (distance < 100) {
              score += 0.2;
            } else if (distance < 150) {
              score += 0.1;
            }
          }
          
          // Interactive bonus
          if (requireInteractive) {
            const tag = el.tagName.toLowerCase();
            const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
              el.getAttribute('role') === 'button' ||
              el.getAttribute('role') === 'link' ||
              el.hasAttribute('onclick') ||
              el.getAttribute('tabindex') === '0';
            
            if (isInteractive) {
              score += 0.1;
            } else {
              score -= 0.2; // Penalty for non-interactive when we expect interactive
            }
          }
          
          return { score, matchMethod };
        }
        
        // Search for candidates
        const candidates = [];
        const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [role="link"], [onclick], [tabindex="0"]';
        const elements = requireInteractive 
          ? document.querySelectorAll(interactiveSelectors)
          : document.body.querySelectorAll('*');
        
        for (const el of elements) {
          if (!(el instanceof HTMLElement)) continue;
          
          // Skip hidden elements
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          
          const { score, matchMethod } = scoreElement(el);
          
          if (score > 0.3) { // Minimum threshold
            candidates.push({
              element: el,
              score,
              matchMethod,
              llmId: el.getAttribute(LLM_ID_ATTR),
            });
          }
        }
        
        // Sort by score and return best match
        candidates.sort((a, b) => b.score - a.score);
        
        if (candidates.length === 0) {
          return null;
        }
        
        const best = candidates[0];
        return {
          element: best.element,
          score: best.score,
          matchMethod: best.matchMethod,
          newElementId: best.llmId,
        };
      })()
    `;
    
    const result = (await sendCommand('Runtime.evaluate', {
      expression: searchExpression,
      returnByValue: false, // Return object reference, not value
    })) as any;
    
    if (!result?.result?.objectId && !result?.result?.value) {
      return null;
    }
    
    // If we got a value back (the object with score/method), we need to get the element's objectId
    if (result.result.value) {
      const matchInfo = result.result.value;
      if (!matchInfo || matchInfo.score < minConfidence) {
        return null;
      }
      
      // The element reference was lost when returning value - need to re-run to get objectId
      // This is a limitation, so let's use a different approach
      console.log('[SelfHeal] Found ghost match with score:', matchInfo.score, 'method:', matchInfo.matchMethod);
    }
    
    // Alternative: Run expression that returns the element directly
    const directSearchExpression = `
      (function() {
        // Same search logic but returns the element directly
        ${searchExpression.replace('return {', '// Return element directly\n        return best?.element || null;\n        /*').replace(/}\)$/, '*/')}
        ${searchExpression.slice(searchExpression.indexOf('(function()'), searchExpression.lastIndexOf('return {'))}
        return candidates[0]?.element || null;
      })()
    `;
    
    // Actually, let's use a simpler approach - just find and return the best matching element
    const elementResult = (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const searchName = ${JSON.stringify(name || '')};
          const searchRole = ${JSON.stringify(role || '')};
          const searchCoords = ${JSON.stringify(coordinates)};
          const LLM_ID_ATTR = 'data-llm-id';
          
          // Find all potentially matching elements
          const selectors = 'button, a, input, select, textarea, [role="button"], [role="link"], [data-llm-id]';
          const elements = document.querySelectorAll(selectors);
          
          let bestMatch = null;
          let bestScore = 0;
          
          for (const el of elements) {
            if (!(el instanceof HTMLElement)) continue;
            
            // Skip hidden
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            
            let score = 0;
            
            // Text match
            const text = (el.innerText || '').trim().toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            if (searchName) {
              const search = searchName.toLowerCase();
              if (text === search || aria === search) score += 0.5;
              else if (text.includes(search) || aria.includes(search)) score += 0.3;
            }
            
            // Role match
            const elRole = el.getAttribute('role') || '';
            const tagRole = {'button':'button','a':'link','input':'input'}[el.tagName.toLowerCase()] || '';
            if (searchRole && (elRole === searchRole || tagRole === searchRole)) {
              score += 0.3;
            }
            
            // Coordinate match
            if (searchCoords) {
              const rect = el.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const dist = Math.sqrt(Math.pow(cx - searchCoords[0], 2) + Math.pow(cy - searchCoords[1], 2));
              if (dist < 50) score += 0.3;
              else if (dist < 100) score += 0.15;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = el;
            }
          }
          
          return bestScore >= ${minConfidence} ? bestMatch : null;
        })()
      `,
      returnByValue: false,
    })) as any;
    
    if (!elementResult?.result?.objectId) {
      console.log('[SelfHeal] No ghost match found above confidence threshold');
      return null;
    }
    
    // Get the new element ID if it was re-tagged
    const idResult = (await sendCommand('Runtime.callFunctionOn', {
      objectId: elementResult.result.objectId,
      functionDeclaration: 'function() { return this.getAttribute("data-llm-id"); }',
      returnByValue: true,
    })) as any;
    
    console.log('[SelfHeal] Ghost match successful!', {
      newId: idResult?.result?.value,
      confidence: 'above threshold',
    });
    
    return {
      objectId: elementResult.result.objectId,
      newElementId: idResult?.result?.value || null,
      confidence: minConfidence, // We know it's at least this
      matchMethod: 'combined',
    };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[SelfHeal] Ghost match search failed:', errorMessage);
    return null;
  }
}

/**
 * Get object ID for element using accessibility mapping when available, fallback to DOM-based approach
 * CRITICAL FIX: Stale Element Recovery (Section 2.6) - Handles React/Vue re-renders that destroy old elements
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §7.1 (Task 6: Accessibility-DOM Element Mapping)
 * Reference: PRODUCTION_READINESS.md §2.6 (Stale Element Race Conditions)
 */
async function getObjectId(originalId: number): Promise<string> {
  const tabId = useAppState.getState().currentTask.tabId;
  const accessibilityMapping = useAppState.getState().currentTask.accessibilityMapping;
  const hybridElements = useAppState.getState().currentTask.hybridElements;

  // V3 ADVANCED: Store recovery information for self-healing ghost match
  // If element ID becomes stale (React re-render), we can search by text/role/coordinates
  const element = hybridElements?.[originalId];
  const recoveryInfo = element ? {
    text: element.name || element.description || null,
    role: element.role || null,
    interactive: element.interactive || false,
  } : null;
  
  // V3 ADVANCED: Ghost match config for self-healing
  const ghostMatchConfig: GhostMatchConfig | null = element ? {
    name: element.name || element.description || null,
    role: element.role || null,
    coordinates: element.bounds ? [
      element.bounds.x + element.bounds.width / 2,
      element.bounds.y + element.bounds.height / 2,
    ] as [number, number] : null,
    interactive: element.interactive || false,
    minConfidence: 0.5, // Require at least 50% confidence
  } : null;

  // Try accessibility mapping first if available (Task 6)
  if (accessibilityMapping) {
    try {
      // Get accessibility node ID from element index
      const axNodeId = getAXNodeIdFromElementIndex(originalId, accessibilityMapping);
      
      if (axNodeId) {
        // Get backendDOMNodeId from mapping
        const backendDOMNodeId = accessibilityMapping.axNodeIdToBackendDOMNodeId.get(axNodeId);
        
        if (backendDOMNodeId !== undefined) {
          // Use backendDOMNodeId to get object ID directly
          try {
            const result = (await sendCommand('DOM.resolveNode', {
              backendNodeId: backendDOMNodeId,
            })) as { object: { objectId: string } } | null;

            if (result?.object?.objectId) {
              console.log('Using accessibility mapping for element targeting', {
                elementId: originalId,
                axNodeId,
                backendDOMNodeId,
              });
              return result.object.objectId;
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn('Accessibility mapping failed, falling back to DOM:', errorMessage);
            // Continue to DOM fallback
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Accessibility mapping lookup failed, falling back to DOM:', errorMessage);
      // Continue to DOM fallback
    }
  }

  // V3 SEMANTIC MODE: Try data-llm-id first (stable IDs from tagger.ts)
  // This is the PRIMARY lookup method - IDs stamped by tagger persist across re-renders
  try {
    const document = (await sendCommand('DOM.getDocument')) as any;
    const { nodeId } = (await sendCommand('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: `[${LLM_ID_ATTR}="${originalId}"]`,
    })) as any;
    
    if (nodeId) {
      const result = (await sendCommand('DOM.resolveNode', { nodeId })) as any;
      const objectId = result.object.objectId;
      if (objectId) {
        console.debug(`[domActions] Found element by data-llm-id="${originalId}"`);
        return objectId;
      }
    }
  } catch (error: unknown) {
    // data-llm-id not found, continue to fallbacks
    console.debug(`[domActions] Element with data-llm-id="${originalId}" not found, trying fallbacks`);
  }

  // Try normal DOM-based resolution (legacy SPADEWORKS_ELEMENT_SELECTOR)
  try {
    // Fallback to DOM-based approach (existing implementation)
    // Pass explicit tabId to callRPC
    // Use retries here: the content script can be temporarily unavailable during navigation/hydration.
    const uniqueId = await callRPC('getUniqueElementSelectorId', [originalId], 5, tabId);
    // get node id
    const document = (await sendCommand('DOM.getDocument')) as any;
    const { nodeId } = (await sendCommand('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: `[${SPADEWORKS_ELEMENT_SELECTOR}="${uniqueId}"]`,
    })) as any;
    if (!nodeId) {
      throw new Error('Could not find node');
    }
    // get object id
    const result = (await sendCommand('DOM.resolveNode', { nodeId })) as any;
    const objectId = result.object.objectId;
    if (!objectId) {
      throw new Error('Could not find object');
    }
    return objectId;
  } catch (error: unknown) {
    // V3 ADVANCED: Self-Healing Ghost Match Recovery
    // If normal resolution fails (element ID is stale), use advanced ghost matching
    console.warn(`[SelfHeal] Element ${originalId} not found, attempting ghost match recovery`);
    
    // Try V3 ghost match first (uses coordinates + role + name)
    if (ghostMatchConfig) {
      const ghostResult = await findGhostMatch(ghostMatchConfig);
      if (ghostResult) {
        console.log('[SelfHeal] Ghost match recovery successful:', {
          originalId,
          newId: ghostResult.newElementId,
          confidence: ghostResult.confidence,
          method: ghostResult.matchMethod,
        });
        return ghostResult.objectId;
      }
    }
    
    // Fallback to legacy recovery (text/role search without coordinates)
    if (recoveryInfo && recoveryInfo.text) {
      console.log('[SelfHeal] Ghost match failed, trying legacy text search:', recoveryInfo);
      
      try {
        // Search for element with matching text and role
        const searchExpression = `
          (function() {
            const searchText = ${JSON.stringify(recoveryInfo.text)};
            const searchRole = ${JSON.stringify(recoveryInfo.role || '')};
            const isInteractive = ${recoveryInfo.interactive};
            
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_ELEMENT,
              null
            );
            
            let node;
            const candidates = [];
            
            while (node = walker.nextNode()) {
              if (node instanceof HTMLElement) {
                const textContent = (node.textContent || '').trim();
                const role = node.getAttribute('role') || '';
                const tagName = node.tagName.toLowerCase();
                
                // Check if text matches (exact or contains)
                const textMatches = textContent === searchText || 
                                   textContent.includes(searchText) ||
                                   (node.getAttribute('aria-label') || '').includes(searchText) ||
                                   (node.getAttribute('name') || '').includes(searchText);
                
                // Check if role matches (if specified)
                const roleMatches = !searchRole || role === searchRole;
                
                // Check if element is interactive (if specified)
                const interactiveMatches = !isInteractive || 
                  tagName === 'button' || 
                  tagName === 'a' || 
                  tagName === 'input' ||
                  role === 'button' ||
                  role === 'link' ||
                  node.hasAttribute('onclick');
                
                if (textMatches && roleMatches && interactiveMatches) {
                  candidates.push(node);
                }
              }
            }
            
            // Return first candidate (most likely match)
            return candidates.length > 0 ? candidates[0] : null;
          })()
        `;
        
        const searchResult = (await sendCommand('Runtime.evaluate', {
          expression: searchExpression,
        })) as { objectId?: string } | null;
        
        if (searchResult?.objectId) {
          console.log('[SelfHeal] Legacy text recovery successful:', {
            originalId,
            recoveryInfo,
          });
          return searchResult.objectId;
        }
      } catch (recoveryError: unknown) {
        const recoveryErrorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
        console.warn('[SelfHeal] Legacy recovery failed:', recoveryErrorMessage);
      }
    }
    
    // If all recovery attempts fail, throw original error with recovery info
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`[SelfHeal] Element ${originalId} not found and all recovery methods failed: ${errorMessage}`);
  }
}

/**
 * Find the scroll parent container for an element
 * CRITICAL FIX: Advanced Scroll Targeting (Section 5.4) - Container-aware scrolling
 * 
 * Reference: PRODUCTION_READINESS.md §5.4 (Advanced Scroll Targeting)
 */
async function findScrollParent(objectId: string): Promise<string | null> {
  try {
    // Walk up the DOM tree checking for scroll containers
    const result = (await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          let element = this;
          
          while (element && element !== document.body && element !== document.documentElement) {
            // CRITICAL FIX: Wrap getComputedStyle in try-catch (can fail on detached elements)
            let style;
            try {
              style = window.getComputedStyle(element);
            } catch (e) {
              element = element.parentElement;
              continue;
            }
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;
            
            // Check if element is a scroll container
            if (
              (overflowY === 'auto' || overflowY === 'scroll') ||
              (overflowX === 'auto' || overflowX === 'scroll')
            ) {
              // Check if element actually scrolls (has scrollable content)
              if (element.scrollHeight > element.clientHeight ||
                  element.scrollWidth > element.clientWidth) {
                return element;
              }
            }
            
            element = element.parentElement;
          }
          
          return null; // No scroll parent found, use window
        }
      `,
    })) as { objectId?: string } | null;
    
    return result?.objectId || null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to find scroll parent, falling back to window scroll:', errorMessage);
    return null;
  }
}

/**
 * Scroll a specific container to bring an element into view
 * CRITICAL FIX: Advanced Scroll Targeting (Section 5.4)
 */
async function scrollContainer(
  objectId: string,
  direction: 'up' | 'down' | 'left' | 'right' = 'down'
): Promise<void> {
  const scrollParentId = await findScrollParent(objectId);
  
  if (!scrollParentId) {
    // Fallback to standard scrollIntoView
    await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: scrollScriptString,
    });
    await sleep(1000);
    return;
  }
  
  // Scroll the specific container
  await sendCommand('Runtime.callFunctionOn', {
    objectId: scrollParentId,
    functionDeclaration: `
      function() {
        const targetElement = arguments[0];
        const direction = arguments[1];
        
        // Calculate element position relative to scroll container
        const containerRect = this.getBoundingClientRect();
        const elementRect = targetElement.getBoundingClientRect();
        
        const relativeTop = elementRect.top - containerRect.top;
        const relativeLeft = elementRect.left - containerRect.left;
        
        // Scroll to center element in container
        if (direction === 'down' || direction === 'up') {
          this.scrollTop = relativeTop - (this.clientHeight / 2) + (elementRect.height / 2);
        }
        
        if (direction === 'left' || direction === 'right') {
          this.scrollLeft = relativeLeft - (this.clientWidth / 2) + (elementRect.width / 2);
        }
      }
    `,
    arguments: [{ objectId }, direction],
  });
  
  await sleep(500); // Shorter wait for container scroll
}

async function scrollIntoView(objectId: string) {
  // Use container-aware scrolling if available
  await scrollContainer(objectId, 'down');
}

/**
 * Get center coordinates of an element for clicking
 * CRITICAL FIX: Handle "Could not compute box model" error
 * This happens when element is:
 * - Not visible (display: none, visibility: hidden)
 * - Has no dimensions (0x0 size)
 * - Off-screen or not rendered yet
 */
async function getCenterCoordinates(objectId: string, retryCount = 0): Promise<{ x: number; y: number }> {
  const MAX_RETRIES = 3;
  
  try {
    const result = (await sendCommand('DOM.getBoxModel', { objectId })) as { model?: { border: number[] } } | null;
    
    if (!result || !result.model || !result.model.border) {
      throw new Error('Box model returned null or missing border data');
    }
    
    const [x1, y1, x2, y2, x3, y3, x4, y4] = result.model.border;
    const centerX = (x1 + x3) / 2;
    const centerY = (y1 + y3) / 2;
    
    // Validate coordinates are reasonable (not NaN, not negative for visible elements)
    if (isNaN(centerX) || isNaN(centerY)) {
      throw new Error('Computed coordinates are NaN');
    }
    
    // Check if element has zero dimensions (likely hidden)
    const width = Math.abs(x3 - x1);
    const height = Math.abs(y3 - y1);
    if (width === 0 && height === 0) {
      throw new Error('Element has zero dimensions (may be hidden)');
    }
    
    return { x: centerX, y: centerY };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's the specific "Could not compute box model" error
    if (errorMessage.includes('Could not compute box model') || 
        errorMessage.includes('zero dimensions') ||
        errorMessage.includes('NaN')) {
      
      if (retryCount < MAX_RETRIES) {
        console.warn(`[getCenterCoordinates] Box model failed (attempt ${retryCount + 1}/${MAX_RETRIES}), trying to make element visible...`);
        
        // Try to force the element to be visible and scrolled into view
        try {
          await sendCommand('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `
              function() {
                // Force element to be visible
                this.style.visibility = 'visible';
                this.style.opacity = '1';
                
                // Scroll into view with center alignment
                this.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                
                // Force layout recalculation
                void this.offsetHeight;
              }
            `,
          });
          
          // Wait for layout to settle
          await sleep(300);
          
          // Retry getting coordinates
          return getCenterCoordinates(objectId, retryCount + 1);
        } catch (scrollError) {
          console.warn('[getCenterCoordinates] Failed to scroll element into view:', scrollError);
        }
      }
      
      // Final fallback: try to get coordinates via JavaScript
      console.warn('[getCenterCoordinates] Falling back to JavaScript-based coordinate calculation');
      try {
        const jsResult = (await sendCommand('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: `
            function() {
              const rect = this.getBoundingClientRect();
              // If element has no size, try to find a visible child or parent
              if (rect.width === 0 || rect.height === 0) {
                // Try first visible child
                const child = this.querySelector('*');
                if (child) {
                  const childRect = child.getBoundingClientRect();
                  if (childRect.width > 0 && childRect.height > 0) {
                    return {
                      x: childRect.left + childRect.width / 2,
                      y: childRect.top + childRect.height / 2,
                      fallback: 'child',
                      success: true
                    };
                  }
                }
                // Try parent element chain
                let parent = this.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                  const parentRect = parent.getBoundingClientRect();
                  if (parentRect.width > 0 && parentRect.height > 0) {
                    // Use the parent's center as fallback
                    return {
                      x: parentRect.left + parentRect.width / 2,
                      y: parentRect.top + parentRect.height / 2,
                      fallback: 'parent',
                      success: true
                    };
                  }
                  parent = parent.parentElement;
                  depth++;
                }
                // CRITICAL FIX: Do NOT return viewport center - this causes click misplacement
                // Instead, return failure so the action fails cleanly
                return {
                  x: 0,
                  y: 0,
                  fallback: 'none',
                  success: false,
                  error: 'Element has zero dimensions and no visible parent/child found'
                };
              }
              return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                fallback: null,
                success: true
              };
            }
          `,
          returnByValue: true,
        })) as { result: { value: { x: number; y: number; fallback: string | null; success: boolean; error?: string } } };
        
        const coords = jsResult.result.value;
        
        // CRITICAL: Check if coordinate calculation succeeded
        if (!coords.success) {
          const errorMsg = coords.error || 'Could not determine element coordinates';
          console.error('[getCenterCoordinates] Coordinate calculation failed:', errorMsg);
          throw new Error(errorMsg);
        }
        
        if (coords.fallback) {
          console.warn(`[getCenterCoordinates] Used fallback method: ${coords.fallback}`);
        }
        return { x: coords.x, y: coords.y };
      } catch (jsError) {
        console.error('[getCenterCoordinates] JavaScript fallback also failed:', jsError);
        throw jsError; // Re-throw to trigger proper error handling
      }
    }
    
    // Re-throw with more context
    throw new Error(`Could not get element coordinates: ${errorMessage}. The element may be hidden, have no dimensions, or not be rendered.`);
  }
}

const delayBetweenClicks = 1000; // Set this value to control the delay between clicks
const delayBetweenKeystrokes = 100; // Set this value to control typing speed

async function clickAtPosition(
  x: number,
  y: number,
  clickCount = 1
): Promise<void> {
  const tabId = useAppState.getState().currentTask.tabId;
  console.log('[domActions.clickAtPosition] Dispatching mouse events at:', { x, y, clickCount, tabId });
  
  // Cosmetic only: ripple animation. Never let this throw / spam console with
  // "Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist."
  if (typeof tabId === 'number') {
    void callRPC('ripple', [x, y], 1, tabId).catch(() => {
      // Best-effort: content script may not be ready during navigation
    });
  }
  
  console.log('[domActions.clickAtPosition] Sending mousePressed');
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });
  
  console.log('[domActions.clickAtPosition] Sending mouseReleased');
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount,
  });
  
  console.log('[domActions.clickAtPosition] Mouse events sent, waiting for delay');
  await sleep(delayBetweenClicks);
  console.log('[domActions.clickAtPosition] Click complete');
}

/**
 * Check if click had side effects (URL change, DOM mutation, network activity)
 * CRITICAL FIX: Hydration Gap (Section 4.4) - Detects "dead clicks" where element isn't interactive yet
 * 
 * Reference: PRODUCTION_READINESS.md §4.4 (The "Hydration Gap")
 */
async function checkClickSideEffects(
  objectId: string,
  beforeState: { url: string; domHash: string }
): Promise<{ detected: boolean; reason: string }> {
  try {
    // Check URL change
    const currentUrlResult = (await sendCommand('Runtime.evaluate', {
      expression: 'window.location.href',
    })) as string;
    
    if (currentUrlResult && currentUrlResult !== beforeState.url) {
      return { detected: true, reason: 'URL changed' };
    }
    
    // Check DOM mutations (simple hash of body HTML)
    const currentDomHashResult = (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const body = document.body.innerHTML;
          // Simple hash
          let hash = 0;
          for (let i = 0; i < Math.min(body.length, 1000); i++) {
            hash = ((hash << 5) - hash) + body.charCodeAt(i);
            hash = hash & hash;
          }
          return hash.toString();
        })()
      `,
    })) as string;
    
    if (currentDomHashResult && currentDomHashResult !== beforeState.domHash) {
      return { detected: true, reason: 'DOM mutated' };
    }
    
    // Note: Network request checking would require Performance API in content script
    // This is handled separately via network idle detection in waitForDOMStabilization
    
    return { detected: false, reason: 'No side effects detected' };
  } catch (error: unknown) {
    // If check fails, assume side effects occurred (don't block on check failures)
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Click side effect check failed, assuming effects occurred:', errorMessage);
    return { detected: true, reason: 'Check failed, assuming effects' };
  }
}

async function click(payload: { elementId: number; selectorPath?: string }) {
  console.log('[domActions.click] Starting click for elementId:', payload.elementId, 'selectorPath:', payload.selectorPath);
  
  // CRITICAL FIX: Check if this is a virtual element (text node menu item)
  // Virtual elements have coordinates stored in state instead of DOM nodes
  const virtualCoordinates = useAppState.getState().currentTask.virtualElementCoordinates;
  if (virtualCoordinates && virtualCoordinates.has(payload.elementId)) {
    const coords = virtualCoordinates.get(payload.elementId)!;
    console.log('[domActions.click] Clicking virtual element at coordinates:', {
      elementId: payload.elementId,
      coordinates: coords,
    });
    // Click directly at the stored coordinates (no need to scroll or resolve DOM)
    await clickAtPosition(coords.x, coords.y);
    console.log('[domActions.click] Virtual element click completed');
    return;
  }
  
  // Normal DOM element - resolve and click as usual
  console.log('[domActions.click] Resolving objectId for elementId:', payload.elementId);
  const objectId = await getObjectId(payload.elementId);
  console.log('[domActions.click] Got objectId:', objectId);
  
  await scrollIntoView(objectId);
  console.log('[domActions.click] Scrolled into view');
  
  const { x, y } = await getCenterCoordinates(objectId);
  console.log('[domActions.click] Got center coordinates:', { x, y });
  
  // CRITICAL FIX: Click Obstruction Check (Section 2.4)
  // Hit test: Check what element is actually at these coordinates
  // Prevents clicking overlays (cookie banners, toasts) that sit on top of target elements
  try {
    const hitTestResult = (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const element = document.elementFromPoint(${x}, ${y});
          if (!element) return null;
          return {
            tagName: element.tagName,
            id: element.id || '',
            className: element.className || '',
            text: (element.textContent || '').substring(0, 50),
          };
        })()
      `,
    })) as { tagName: string; id: string; className: string; text: string } | null;
    
    // Get target element info for comparison
    const targetElement = (await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          return {
            tagName: this.tagName,
            id: this.id || '',
            className: this.className || '',
          };
        }
      `,
    })) as { tagName: string; id: string; className: string } | null;
    
    // Verify the element at (x, y) is the target or a child of target
    if (hitTestResult && targetElement) {
      // Check if hit test element is the target itself
      const isExactMatch = hitTestResult.id === targetElement.id && hitTestResult.id !== '';
      
      // Check if hit test element is a child of target (walk up the DOM tree)
      const isChildOfTarget = (await sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const hitElement = document.elementFromPoint(${x}, ${y});
            if (!hitElement) return false;
            
            // Walk up the DOM tree to see if target is an ancestor
            let current = hitElement;
            while (current && current !== document.body) {
              if (current.id === '${targetElement.id}' && current.id !== '') {
                return true;
              }
              if (current.tagName === '${targetElement.tagName}' && 
                  current.className === '${targetElement.className}') {
                return true;
              }
              current = current.parentElement;
            }
            return false;
          })()
        `,
      })) as boolean;
      
      // If neither exact match nor child, element is obstructed
      if (!isExactMatch && !isChildOfTarget) {
        const errorMessage = `Click obstructed by element: ${hitTestResult.tagName}${hitTestResult.id ? `#${hitTestResult.id}` : ''}${hitTestResult.className ? `.${hitTestResult.className.split(' ')[0]}` : ''} (text: "${hitTestResult.text}")`;
        console.warn('Click obstruction detected:', {
          target: targetElement,
          obstructing: hitTestResult,
          coordinates: { x, y },
        });
        throw new Error(errorMessage);
      }
    }
  } catch (error: unknown) {
    // If hit test fails, log warning but continue (don't block click)
    // This ensures we don't break existing functionality if hit test has issues
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Hit test failed, proceeding with click:', errorMessage);
  }
  
  // CRITICAL FIX: Hydration Gap (Section 4.4) - Capture state before click
  const beforeState = {
    url: (await sendCommand('Runtime.evaluate', {
      expression: 'window.location.href',
    })) as string,
    domHash: (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const body = document.body.innerHTML;
          let hash = 0;
          for (let i = 0; i < Math.min(body.length, 1000); i++) {
            hash = ((hash << 5) - hash) + body.charCodeAt(i);
            hash = hash & hash;
          }
          return hash.toString();
        })()
      `,
    })) as string,
  };
  
  // Execute click
  await clickAtPosition(x, y);
  
  // Verify click had side effects
  await sleep(300);
  
  const sideEffects = await checkClickSideEffects(objectId, beforeState);
  
  if (!sideEffects.detected) {
    console.warn('Click had no side effects, retrying...', {
      elementId: payload.elementId,
      reason: sideEffects.reason,
    });
    
    // Retry click (element might be interactive now)
    await clickAtPosition(x, y);
    await sleep(300);
    
    const retrySideEffects = await checkClickSideEffects(objectId, beforeState);
    
    if (!retrySideEffects.detected) {
      throw new Error(
        `Click had no side effects after retry. Element may not be interactive yet. ` +
        `Reason: ${retrySideEffects.reason}`
      );
    }
    
    console.log('Click side effects detected on retry:', retrySideEffects.reason);
  } else {
    console.log('Click side effects detected:', sideEffects.reason);
  }
}

async function selectAllText(x: number, y: number) {
  await clickAtPosition(x, y, 3);
}

async function typeText(text: string): Promise<void> {
  for (const char of text) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(delayBetweenKeystrokes / 2);
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
    await sleep(delayBetweenKeystrokes / 2);
  }
}

async function blurFocusedElement() {
  const blurFocusedElementScript = `
      if (document.activeElement) {
        document.activeElement.blur();
      }
    `;
  await sendCommand('Runtime.evaluate', {
    expression: blurFocusedElementScript,
  });
}

async function setValue(payload: {
  elementId: number;
  value: string;
  selectorPath?: string;
}): Promise<void> {
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);

  // CRITICAL FIX: React Input Trap - Simulate real user interaction
  // 1. Focus the element first (Crucial for React to "wake up")
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() { this.focus(); }`,
  });
  await sleep(100); // Small delay after focus

  // 2. Clear existing value (User-like select all + delete)
  await selectAllText(x, y);
  await sleep(50);

  // 3. Type characters using native keystrokes (Bypasses React's event suppression)
  // This ensures React/Angular/Vue frameworks detect the input changes
  for (const char of payload.value) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(50 + Math.random() * 50); // Random delay makes it look human
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
  }

  // 4. Dispatch events to force React/Angular/Vue to sync state
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        this.blur(); // Trigger validation on blur
      }
    `,
  });
}

export const domActions = {
  click,
  setValue,
} as const;

export type DOMActions = typeof domActions;
type ActionName = keyof DOMActions;
type ActionPayload<T extends ActionName> = Parameters<DOMActions[T]>[0];

/**
 * Action execution result
 * Used to report success/failure status to the server
 */
export type ActionExecutionResult = {
  success: boolean;
  error?: {
    message: string;
    code: string;
    action: string;
    elementId?: number;
  };
  actualState?: string; // What actually happened (for verification)
};

/**
 * Fallback action executor using direct script injection.
 * Used when the normal debugger/content script path fails.
 * 
 * ROBUST ELEMENT FINDING (Fix for "clicking elsewhere" issue):
 * - First tries to find element by index
 * - Falls back to selector path if index fails (element re-rendered)
 * - Last resort: common selectors for known element types (e.g., Google search bar)
 */
async function executeActionViaInjection(
  type: string,
  payload: { elementId?: number; value?: string; key?: string; selectorPath?: string }
): Promise<{ success: boolean; error?: string }> {
  const tabId = useAppState.getState().currentTask.tabId;
  
  if (!tabId || tabId <= 0) {
    return { success: false, error: 'Invalid tabId for injection' };
  }
  
  // Check if chrome.scripting is available
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
    return { success: false, error: 'chrome.scripting API not available' };
  }
  
  console.log(`[domActions] Attempting fallback action via injection: ${type}`, payload);
  
  try {
    // For setValue, we need to find the element and set its value
    if (type === 'setValue' && payload.value !== undefined) {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (elementIndex: number, value: string, selectorPath: string | null) => {
          try {
            // ROBUST ELEMENT FINDING:
            // 1. First try selector path (most reliable if available)
            // 2. Then try by index
            // 3. Last resort: common fallback selectors for inputs
            
            var element = null;
            var findMethod = 'none';
            
            // Strategy 1: Try selector path if provided
            if (selectorPath) {
              try {
                element = document.querySelector(selectorPath);
                if (element) {
                  findMethod = 'selectorPath';
                  console.log('[Fallback] Found element via selector path:', selectorPath);
                }
              } catch (selectorError) {
                console.warn('[Fallback] Selector path failed:', selectorPath, selectorError);
              }
            }
            
            // Strategy 2: Try by index in interactive elements list
            if (!element) {
              var interactiveSelectors = 'a[href], button, input, textarea, select, ' +
                '[role="button"], [role="link"], [role="textbox"], [role="combobox"], ' +
                '[role="listbox"], [role="menuitem"], [role="tab"], [role="checkbox"], ' +
                '[role="radio"], [onclick], [tabindex]:not([tabindex="-1"])';
              
              var elements = document.querySelectorAll(interactiveSelectors);
              var visibleElements = [];
              
              for (var i = 0; i < elements.length; i++) {
                var el = elements[i] as HTMLElement;
                try {
                  var style = window.getComputedStyle(el);
                  var rect = el.getBoundingClientRect();
                  if (style.display !== 'none' && style.visibility !== 'hidden' && 
                      rect.width > 0 && rect.height > 0) {
                    visibleElements.push(el);
                  }
                } catch (e) {
                  // Skip problematic elements
                }
              }
              
              if (elementIndex < visibleElements.length) {
                element = visibleElements[elementIndex];
                findMethod = 'index';
                console.log('[Fallback] Found element via index:', elementIndex);
              }
            }
            
            // Strategy 3: Last resort for inputs - try common selectors
            // This specifically helps with Google's search bar which has name="q"
            if (!element) {
              var fallbackSelectors = [
                'input[name="q"]',           // Google search
                'textarea[name="q"]',        // Google search (textarea variant)
                'input[type="search"]',      // Generic search inputs
                'input[aria-label="Search"]', // Accessibility-labeled search
                '[role="searchbox"]',        // ARIA searchbox
                'input:focus',               // Currently focused input
                'textarea:focus',            // Currently focused textarea
              ];
              
              for (var j = 0; j < fallbackSelectors.length; j++) {
                try {
                  element = document.querySelector(fallbackSelectors[j]);
                  if (element) {
                    findMethod = 'fallback:' + fallbackSelectors[j];
                    console.log('[Fallback] Found element via fallback selector:', fallbackSelectors[j]);
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }
            }
            
            if (!element) {
              return { 
                success: false, 
                error: 'Element not found: index=' + elementIndex + 
                       ', selectorPath=' + (selectorPath || 'none') +
                       '. DOM may have re-rendered.' 
              };
            }
            
            // Focus the element
            (element as HTMLElement).focus();
            
            // Clear and set value
            (element as HTMLInputElement).value = '';
            (element as HTMLInputElement).value = value;
            
            // Dispatch events for React/Angular/Vue
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true, error: null, findMethod: findMethod };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [payload.elementId || 0, payload.value, payload.selectorPath || null],
        world: 'MAIN',
      });
      
      if (results && results[0] && results[0].result) {
        return results[0].result as { success: boolean; error?: string };
      }
      return { success: false, error: 'Script returned no result' };
    }
    
    // For click, find the element and click it
    if (type === 'click') {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (elementIndex: number, selectorPath: string | null) => {
          try {
            // ROBUST ELEMENT FINDING (same strategy as setValue)
            var element = null;
            var findMethod = 'none';
            
            // Strategy 1: Try selector path if provided
            if (selectorPath) {
              try {
                element = document.querySelector(selectorPath);
                if (element) {
                  findMethod = 'selectorPath';
                  console.log('[Fallback] Found element via selector path:', selectorPath);
                }
              } catch (selectorError) {
                console.warn('[Fallback] Selector path failed:', selectorPath, selectorError);
              }
            }
            
            // Strategy 2: Try by index
            if (!element) {
              var interactiveSelectors = 'a[href], button, input, textarea, select, ' +
                '[role="button"], [role="link"], [role="textbox"], [role="combobox"], ' +
                '[role="listbox"], [role="menuitem"], [role="tab"], [role="checkbox"], ' +
                '[role="radio"], [onclick], [tabindex]:not([tabindex="-1"])';
              
              var elements = document.querySelectorAll(interactiveSelectors);
              var visibleElements = [];
              
              for (var i = 0; i < elements.length; i++) {
                var el = elements[i] as HTMLElement;
                try {
                  var style = window.getComputedStyle(el);
                  var rect = el.getBoundingClientRect();
                  if (style.display !== 'none' && style.visibility !== 'hidden' && 
                      rect.width > 0 && rect.height > 0) {
                    visibleElements.push(el);
                  }
                } catch (e) {
                  // Skip
                }
              }
              
              if (elementIndex < visibleElements.length) {
                element = visibleElements[elementIndex];
                findMethod = 'index';
              }
            }
            
            if (!element) {
              return { 
                success: false, 
                error: 'Element not found: index=' + elementIndex + 
                       ', selectorPath=' + (selectorPath || 'none')
              };
            }
            
            // Scroll into view
            (element as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            
            // Click the element
            (element as HTMLElement).click();
            
            return { success: true, error: null, findMethod: findMethod };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [payload.elementId || 0, payload.selectorPath || null],
        world: 'MAIN',
      });
      
      if (results && results[0] && results[0].result) {
        return results[0].result as { success: boolean; error?: string };
      }
      return { success: false, error: 'Script returned no result' };
    }
    
    // For press, dispatch keyboard events on the active element
    if (type === 'press' && payload.key) {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (keyName: string) => {
          try {
            // Get the currently focused element
            var targetElement = document.activeElement || document.body;
            
            // Map common key names to KeyboardEvent properties
            var keyMap: { [key: string]: { key: string; code: string; keyCode: number } } = {
              'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
              'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
              'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
              'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
              'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
              'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
              'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
              'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
              'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
              'Space': { key: ' ', code: 'Space', keyCode: 32 },
              ' ': { key: ' ', code: 'Space', keyCode: 32 },
            };
            
            var keyInfo = keyMap[keyName] || { key: keyName, code: keyName, keyCode: 0 };
            
            // Create and dispatch keydown event
            var keydownEvent = new KeyboardEvent('keydown', {
              key: keyInfo.key,
              code: keyInfo.code,
              keyCode: keyInfo.keyCode,
              which: keyInfo.keyCode,
              bubbles: true,
              cancelable: true,
            });
            targetElement.dispatchEvent(keydownEvent);
            
            // For Enter key on forms, also try to submit the form
            if (keyName === 'Enter') {
              // Check if element is an input in a form
              var inputElement = targetElement as HTMLInputElement;
              if (inputElement && inputElement.form) {
                // Try to submit via the form's submit event
                var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                var shouldSubmit = inputElement.form.dispatchEvent(submitEvent);
                if (shouldSubmit) {
                  // If not prevented, manually submit
                  inputElement.form.submit();
                }
              }
            }
            
            // Create and dispatch keyup event
            var keyupEvent = new KeyboardEvent('keyup', {
              key: keyInfo.key,
              code: keyInfo.code,
              keyCode: keyInfo.keyCode,
              which: keyInfo.keyCode,
              bubbles: true,
              cancelable: true,
            });
            targetElement.dispatchEvent(keyupEvent);
            
            return { success: true, error: null };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [payload.key],
        world: 'MAIN',
      });
      
      if (results && results[0] && results[0].result) {
        return results[0].result as { success: boolean; error?: string };
      }
      return { success: false, error: 'Script returned no result' };
    }
    
    return { success: false, error: `Unsupported action type for injection: ${type}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[domActions] Fallback injection failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Call this function from the content script
export const callDOMAction = async <T extends ActionName>(
  type: T,
  payload: ActionPayload<T>
): Promise<ActionExecutionResult> => {
  const actionString = `${type}(${JSON.stringify(payload).slice(1, -1)})`; // e.g., "click(123)"
  const elementId = 'elementId' in payload ? (payload as { elementId: number }).elementId : undefined;
  
  // DEBUG: Log action execution start
  console.log('[domActions] Executing DOM action:', {
    type,
    payload,
    actionString,
    elementId,
    tabId: useAppState.getState().currentTask.tabId,
  });
  
  try {
    // @ts-expect-error - we know that the type is valid
    await domActions[type](payload);
    
    console.log('[domActions] Action completed successfully:', actionString);
    
    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if this is a content script/debugger communication error
    // that might be recoverable via direct injection fallback
    const isRecoverableError = 
      errorMessage.includes('Receiving end does not exist') ||
      errorMessage.includes('Could not establish connection') ||
      errorMessage.includes('Content script') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('Could not find') ||
      errorMessage.includes('getAttribute') ||
      errorMessage.includes('querySelectorAll') ||
      errorMessage.includes('Box model');
    
    if (isRecoverableError && elementId !== undefined && (type === 'click' || type === 'setValue')) {
      console.warn(`[domActions] Normal action failed, attempting fallback injection: ${actionString}`);
      
      // Try fallback via direct script injection
      // Include selectorPath for robust element finding (fixes stale element ID issues)
      // Reference: ROBUST_ELEMENT_SELECTORS_SPEC.md
      const selectorPath = 'selectorPath' in payload ? (payload as { selectorPath?: string }).selectorPath : undefined;
      const fallbackPayload = type === 'setValue' 
        ? { elementId, value: (payload as { elementId: number; value: string }).value, selectorPath }
        : { elementId, selectorPath };
      
      const fallbackResult = await executeActionViaInjection(type, fallbackPayload);
      
      if (fallbackResult.success) {
        console.log(`[domActions] Fallback injection succeeded for: ${actionString}`);
        return { success: true };
      } else {
        console.error(`[domActions] Fallback injection also failed: ${fallbackResult.error}`);
        // Continue to return the original error
      }
    }
    
    // Determine error code based on error message
    let errorCode = 'ACTION_FAILED';
    if (errorMessage.includes('not found') || errorMessage.includes('Could not find')) {
      errorCode = 'ELEMENT_NOT_FOUND';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      errorCode = 'TIMEOUT';
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      errorCode = 'NETWORK_ERROR';
    } else if (errorMessage.includes('Content script is not loaded')) {
      errorCode = 'CONTENT_SCRIPT_NOT_READY';
    } else if (errorMessage.includes('Receiving end does not exist')) {
      errorCode = 'CONTENT_SCRIPT_DISCONNECTED';
    }
    
    return {
      success: false,
      error: {
        message: errorMessage,
        code: errorCode,
        action: actionString,
        elementId,
      },
      actualState: errorMessage, // Use error message as actual state for verification
    };
  }
};
