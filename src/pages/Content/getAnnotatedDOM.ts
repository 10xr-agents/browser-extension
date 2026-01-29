import { SPADEWORKS_ELEMENT_SELECTOR } from '../../constants';

function isInteractive(
  element: HTMLElement,
  style: CSSStyleDeclaration
): boolean {
  // Check for interactive roles (including menu items that appear dynamically)
  const role = element.getAttribute('role');
  const interactiveRoles = [
    'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'option', 'tab', 'treeitem', 'checkbox', 'radio', 'textbox',
    'searchbox', 'combobox', 'slider', 'switch', 'spinbutton'
  ];
  
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  
  return (
    element.tagName === 'A' ||
    element.tagName === 'INPUT' ||
    element.tagName === 'BUTTON' ||
    element.tagName === 'SELECT' ||
    element.tagName === 'TEXTAREA' ||
    element.hasAttribute('onclick') ||
    element.hasAttribute('onmousedown') ||
    element.hasAttribute('onmouseup') ||
    element.hasAttribute('onkeydown') ||
    element.hasAttribute('onkeyup') ||
    style.cursor === 'pointer'
  );
}

function isVisible(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  return (
    style.opacity !== '' &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.getAttribute('aria-hidden') !== 'true'
  );
}

let currentElements: HTMLElement[] = [];

/**
 * Recursively traverse DOM including Shadow DOM
 * CRITICAL FIX: Shadow DOM Blind Spot - Enterprise apps (Salesforce LWC, Google products) use Shadow DOM
 * Standard DOM traversal stops at shadow-root, making elements invisible
 */
/**
 * Get frame ID for current context
 * CRITICAL FIX: Iframe Support (Section 2.5) - Tag elements with frameId
 * 
 * Reference: PRODUCTION_READINESS.md §2.5 (The "Iframe" Black Hole)
 */
function getFrameId(): string {
  try {
    // Check if we're in an iframe
    if (window.self !== window.top) {
      // We're in an iframe - use a combination of window.name and location for unique ID
      const frameName = window.name || 'unnamed';
      const frameLocation = window.location.href || 'unknown';
      // Create a stable frame ID
      return `frame-${frameName}-${frameLocation.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '-')}`;
    }
    // We're in the main frame
    return 'main-frame';
  } catch (error) {
    // Cross-origin iframe - can't access parent
    return 'cross-origin-frame';
  }
}

function traverseDOM(node: Node, pageElements: HTMLElement[], frameId?: string): {
  pageElements: HTMLElement[];
  clonedDOM: Node;
} {
  const clonedNode = node.cloneNode(false) as Node;
  const currentFrameId = frameId || getFrameId();

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const style = window.getComputedStyle(element);

    const clonedElement = clonedNode as HTMLElement;

    pageElements.push(element);
    clonedElement.setAttribute('data-id', (pageElements.length - 1).toString());
    clonedElement.setAttribute(
      'data-interactive',
      isInteractive(element, style).toString()
    );
    clonedElement.setAttribute(
      'data-visible',
      isVisible(element, style).toString()
    );
    // CRITICAL FIX: Tag element with frameId for iframe support
    clonedElement.setAttribute('data-frame-id', currentFrameId);

    // CRITICAL FIX: Check for Shadow Root and Dive In
    // Shadow DOM elements are encapsulated and invisible to standard querySelector
    if (element.shadowRoot) {
      // Recursively traverse shadow root children
      Array.from(element.shadowRoot.children).forEach((child) => {
        if (child instanceof HTMLElement) {
          const shadowResult = traverseDOM(child, pageElements, currentFrameId);
          clonedNode.appendChild(shadowResult.clonedDOM);
        }
      });
    }
    
    // CRITICAL FIX: Handle iframe elements - traverse into iframe content if accessible
    if (element.tagName === 'IFRAME') {
      try {
        // Try to access iframe content (only works for same-origin iframes)
        const iframe = element as HTMLIFrameElement;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const iframeFrameId = `${currentFrameId}-iframe-${pageElements.length}`;
          const iframeResult = traverseDOM(iframeDoc.documentElement, pageElements, iframeFrameId);
          // Note: We don't append iframe content to cloned DOM (it's a separate document)
          // But we do track the elements for action targeting
        }
      } catch (error) {
        // Cross-origin iframe - cannot access content (expected)
        console.debug('Cannot access iframe content (likely cross-origin):', error);
      }
    }
  }

  // Process regular children (non-shadow)
  node.childNodes.forEach((child) => {
    const result = traverseDOM(child, pageElements, currentFrameId);
    clonedNode.appendChild(result.clonedDOM);
  });

  return {
    pageElements,
    clonedDOM: clonedNode,
  };
}

/**
 * getAnnotatedDom returns the pageElements array and a cloned DOM
 * with data-pe-idx attributes added to each element in the copy.
 */
export default function getAnnotatedDOM() {
  currentElements = [];
  const frameId = getFrameId();
  const result = traverseDOM(document.documentElement, currentElements, frameId);
  return (result.clonedDOM as HTMLElement).outerHTML;
}

// idempotent function to get a unique id for an element
export function getUniqueElementSelectorId(id: number): string {
  const element = currentElements[id];
  // element may already have a unique id
  let uniqueId = element.getAttribute(SPADEWORKS_ELEMENT_SELECTOR);
  if (uniqueId) return uniqueId;
  uniqueId = Math.random().toString(36).substring(2, 10);
  element.setAttribute(SPADEWORKS_ELEMENT_SELECTOR, uniqueId);
  return uniqueId;
}

/**
 * Element snapshot info for DOM change tracking
 */
export interface ElementSnapshotInfo {
  id?: string;
  tagName: string;
  role?: string;
  name?: string;
  text?: string;
  interactive: boolean;
  /** For virtual elements (text nodes), store click coordinates */
  virtualCoordinates?: { x: number; y: number };
  /** Indicates this is a virtual element created from a text node */
  isVirtual?: boolean;
}

/**
 * Get a snapshot of all interactive elements on the page
 * Used for tracking what changed after an action (e.g., dropdown appearing)
 */
/**
 * Recursively traverse element tree including Shadow DOM and Iframes
 * CRITICAL FIX: Shadow DOM Blind Spot + Iframe Support
 * Must traverse shadow roots and iframe content to see all elements
 */
function traverseWithShadowDOM(
  element: HTMLElement,
  elements: ElementSnapshotInfo[],
  seenElements: Set<string>,
  frameId?: string
): void {
  const currentFrameId = frameId || getFrameId();
  const style = window.getComputedStyle(element);
  
  // Skip hidden elements
  if (style.display === 'none' || 
      style.visibility === 'hidden' || 
      style.opacity === '0' ||
      element.getAttribute('aria-hidden') === 'true') {
    // Still traverse children (they might be visible)
  } else if (isInteractive(element, style)) {
    // Process the current element (Add to snapshot if interactive)
    const id = element.getAttribute('data-id') || element.getAttribute('id') || undefined;
    const role = element.getAttribute('role') || undefined;
    const name = element.getAttribute('aria-label') || 
                 element.getAttribute('name') || 
                 element.getAttribute('placeholder') || 
                 undefined;
    const text = element.textContent?.trim().substring(0, 100) || undefined;
    
    const uniqueKey = id || `${element.tagName}-${role || 'no-role'}-${text || 'no-text'}-${element.getBoundingClientRect().top}-${element.getBoundingClientRect().left}`;
    
    if (!seenElements.has(uniqueKey)) {
      seenElements.add(uniqueKey);
      elements.push({
        id,
        tagName: element.tagName,
        role,
        name,
        text,
        interactive: true,
      });
    }
  }
  
  // CRITICAL FIX: Check for Shadow Root and Dive In
  if (element.shadowRoot) {
    Array.from(element.shadowRoot.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        traverseWithShadowDOM(child, elements, seenElements, currentFrameId); // Recursive call
      }
    });
  }
  
  // CRITICAL FIX: Handle iframe elements - traverse into iframe content if accessible
  if (element.tagName === 'IFRAME') {
    try {
      const iframe = element as HTMLIFrameElement;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc && iframeDoc.body) {
        const iframeFrameId = `${currentFrameId}-iframe-${elements.length}`;
        traverseWithShadowDOM(iframeDoc.body as HTMLElement, elements, seenElements, iframeFrameId);
      }
    } catch (error) {
      // Cross-origin iframe - cannot access content (expected)
      console.debug('Cannot access iframe content (likely cross-origin):', error);
    }
  }
  
  // Process regular children
  Array.from(element.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      traverseWithShadowDOM(child, elements, seenElements, currentFrameId);
    }
  });
}

export function getInteractiveElementSnapshot(): ElementSnapshotInfo[] {
  const elements: ElementSnapshotInfo[] = [];
  const seenElements = new Set<string>(); // Track elements we've already added
  
  // CRITICAL FIX: Start traversal from document.body to include Shadow DOM
  // Standard querySelectorAll doesn't see inside shadow roots
  if (document.body) {
    traverseWithShadowDOM(document.body, elements, seenElements);
  }
  
  // Also use querySelectorAll as fallback for elements not caught by traversal
  // (Some elements might not be in the body tree, e.g., in head or document fragments)
  const selectors = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="tab"]',
    '[role="treeitem"]',
    '[role="listitem"]',
    '[onclick]',
    '[data-interactive="true"]',
    '[style*="cursor: pointer"]',
  ].join(', ');
  
  const interactiveElements = document.querySelectorAll(selectors);
  
  // Fallback: Process elements found by querySelectorAll that weren't caught by traversal
  // (Note: querySelectorAll doesn't see Shadow DOM, but traversal above should have caught them)
  interactiveElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    
    const style = window.getComputedStyle(el);
    
    // Skip hidden elements
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0' ||
        el.getAttribute('aria-hidden') === 'true') {
      return;
    }
    
    const id = el.getAttribute('data-id') || el.getAttribute('id') || undefined;
    const role = el.getAttribute('role') || undefined;
    const name = el.getAttribute('aria-label') || 
                 el.getAttribute('name') || 
                 el.getAttribute('placeholder') || 
                 undefined;
    const text = el.textContent?.trim().substring(0, 100) || undefined;
    
    // Create a unique key for this element to avoid duplicates
    // Use data-id if available, otherwise use a combination of tag, role, text, and position
    const uniqueKey = id || `${el.tagName}-${role || 'no-role'}-${text || 'no-text'}-${el.getBoundingClientRect().top}-${el.getBoundingClientRect().left}`;
    
    if (seenElements.has(uniqueKey)) {
      return; // Skip duplicates (already added by traversal)
    }
    seenElements.add(uniqueKey);
    
    elements.push({
      id,
      tagName: el.tagName,
      role,
      name,
      text,
      interactive: isInteractive(el, style) || el.hasAttribute('role'),
    });
  });
  
  // Also look for menu items inside dropdown menus that might not have explicit roles
  // Check for elements inside <ul name="menuEntries"> or similar menu containers
  const menuContainers = document.querySelectorAll('ul[name="menuEntries"], ul[role="menu"], div[role="menu"], ul[aria-label*="menu" i]');
  
  menuContainers.forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    
    const containerStyle = window.getComputedStyle(container);
    
    // Skip hidden containers
    if (containerStyle.display === 'none' || 
        containerStyle.visibility === 'hidden' || 
        containerStyle.opacity === '0' ||
        container.getAttribute('aria-hidden') === 'true') {
      return;
    }
    
    // Get all direct children and nested clickable elements (menu items)
    // Menu items might be direct children or nested inside <li> or <div> elements
    const menuItems: HTMLElement[] = [];
    
    Array.from(container.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      
      // Check if child itself is a menu item
      if (child.tagName === 'A' || child.tagName === 'BUTTON' || 
          child.hasAttribute('onclick') || 
          child.getAttribute('role') === 'menuitem' ||
          child.getAttribute('role') === 'option') {
        menuItems.push(child);
      }
      
      // Also check for nested clickable elements (e.g., <li><a>New/Search</a></li>)
      const nestedClickable = child.querySelectorAll('a, button, [onclick], [role="menuitem"], [role="option"]');
      nestedClickable.forEach((el) => {
        if (el instanceof HTMLElement && !menuItems.includes(el)) {
          menuItems.push(el);
        }
      });
    });
    
    menuItems.forEach((item) => {
      const style = window.getComputedStyle(item);
      
      // Skip hidden menu items
      if (style.display === 'none' || 
          style.visibility === 'hidden' || 
          style.opacity === '0' ||
          item.getAttribute('aria-hidden') === 'true') {
        return;
      }
      
      // Ensure menu item has data-id attribute for tracking
      // If it doesn't have one, assign a temporary ID based on its position
      let id = item.getAttribute('data-id') || item.getAttribute('id');
      if (!id) {
        // Assign a temporary ID for tracking (will be assigned proper ID on next DOM capture)
        const tempId = `menu-item-${item.tagName.toLowerCase()}-${item.textContent?.trim().substring(0, 20).replace(/\s+/g, '-') || 'unknown'}-${Date.now()}`;
        item.setAttribute('data-temp-id', tempId);
        id = tempId;
      }
      
      const role = item.getAttribute('role') || 
                   (item.tagName === 'A' ? 'link' : 
                    item.tagName === 'BUTTON' ? 'button' : 
                    'menuitem'); // Default to menuitem for menu items
      const name = item.getAttribute('aria-label') || 
                   item.getAttribute('name') || 
                   undefined;
      const text = item.textContent?.trim().substring(0, 100) || undefined;
      
      // Create unique key for menu item
      const uniqueKey = id || `menu-${role}-${text || 'no-text'}-${item.getBoundingClientRect().top}-${item.getBoundingClientRect().left}`;
      
      if (seenElements.has(uniqueKey)) {
        return; // Skip duplicates
      }
      seenElements.add(uniqueKey);
      
      elements.push({
        id: id || undefined,
        tagName: item.tagName,
        role,
        name,
        text,
        interactive: true, // Menu items are always interactive
      });
    });
    
    // CRITICAL FIX: Handle text nodes inside ul[name="menuEntries"]
    // These are "ghost" menu items that exist as raw text but aren't wrapped in elements
    // Example: <ul name="menuEntries">New/Search Dashboard Visits</ul>
    if (container.getAttribute('name') === 'menuEntries' || container.getAttribute('role') === 'menu') {
      let textNodeIndex = 0;
      
      // Iterate through ALL child nodes (including text nodes), not just element children
      Array.from(container.childNodes).forEach((node) => {
        // Check if this is a text node with non-empty content
        if (node.nodeType === Node.TEXT_NODE) {
          const textContent = node.textContent?.trim();
          
          // Skip empty or whitespace-only text nodes
          if (!textContent || textContent.length === 0) {
            return;
          }
          
          // Skip very long text (likely not a menu item)
          if (textContent.length > 100) {
            return;
          }
          
          try {
            // Calculate click coordinates for this text node using Range API
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            
            // Skip if the text node has no dimensions (hidden or collapsed)
            if (rect.width === 0 && rect.height === 0) {
              return;
            }
            
            // Calculate center coordinates for clicking
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // Generate a stable virtual ID for this text node menu item
            // Use a hash of the text content and position for stability
            const textHash = textContent.substring(0, 20).replace(/\s+/g, '-').toLowerCase();
            const virtualId = `virtual-menu-entry-${textHash}-${Math.floor(rect.top)}-${Math.floor(rect.left)}`;
            
            // Create unique key for this virtual element
            const uniqueKey = `virtual-${textContent}-${rect.top}-${rect.left}`;
            
            if (seenElements.has(uniqueKey)) {
              return; // Skip duplicates
            }
            seenElements.add(uniqueKey);
            
            // Split text content by common separators (space, slash, etc.) to identify individual menu items
            // Common pattern: "New/Search Dashboard Visits Records"
            const menuItemTexts = textContent.split(/\s+/).filter(t => t.length > 0);
            
            // If text contains multiple words separated by spaces, treat each as a potential menu item
            // But if it contains "/" (like "New/Search"), treat it as a single item
            if (textContent.includes('/') || menuItemTexts.length === 1) {
              // Single menu item (e.g., "New/Search")
              elements.push({
                id: virtualId,
                tagName: 'TEXT',
                role: 'menuitem',
                text: textContent.substring(0, 100),
                interactive: true,
                virtualCoordinates: { x, y },
                isVirtual: true,
              });
            } else {
              // Multiple menu items in one text node (e.g., "New/Search Dashboard Visits")
              // Create a virtual element for each word/phrase
              menuItemTexts.forEach((menuText, idx) => {
                // Recalculate coordinates for each menu item
                // Approximate position based on text length and position
                const textStart = textContent.indexOf(menuText);
                const textEnd = textStart + menuText.length;
                const ratioStart = textStart / textContent.length;
                const ratioEnd = textEnd / textContent.length;
                
                const itemX = rect.left + (rect.width * (ratioStart + ratioEnd) / 2);
                const itemY = rect.top + rect.height / 2;
                
                const itemTextHash = menuText.substring(0, 20).replace(/\s+/g, '-').toLowerCase();
                const itemVirtualId = `virtual-menu-entry-${itemTextHash}-${Math.floor(itemY)}-${Math.floor(itemX)}`;
                const itemUniqueKey = `virtual-${menuText}-${itemY}-${itemX}`;
                
                if (!seenElements.has(itemUniqueKey)) {
                  seenElements.add(itemUniqueKey);
                  elements.push({
                    id: itemVirtualId,
                    tagName: 'TEXT',
                    role: 'menuitem',
                    text: menuText.substring(0, 100),
                    interactive: true,
                    virtualCoordinates: { x: itemX, y: itemY },
                    isVirtual: true,
                  });
                }
              });
            }
            
            textNodeIndex++;
          } catch (error) {
            // If Range API fails, skip this text node
            console.warn('Failed to create virtual element for text node:', error);
          }
        }
      });
    }
  });
  
  return elements;
}

/**
 * Wait for a specific element to appear on the page
 * Used by the waitForElement action
 */
export function waitForElementAppearance(
  selector: { role?: string; text?: string; id?: string },
  timeout: number = 5000
): Promise<{ found: boolean; element?: ElementSnapshotInfo }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    function check() {
      const snapshot = getInteractiveElementSnapshot();
      
      for (const element of snapshot) {
        let matches = true;
        
        if (selector.role && element.role !== selector.role) {
          matches = false;
        }
        if (selector.text && !element.text?.toLowerCase().includes(selector.text.toLowerCase())) {
          matches = false;
        }
        if (selector.id && element.id !== selector.id) {
          matches = false;
        }
        
        if (matches) {
          resolve({ found: true, element });
          return;
        }
      }
      
      if (Date.now() - startTime < timeout) {
        setTimeout(check, 100);
      } else {
        resolve({ found: false });
      }
    }
    
    check();
  });
}

/**
 * Check if a wait condition is met
 * CRITICAL FIX: Wait for Condition (Section 5.5) - Smart Patience
 * 
 * Reference: PRODUCTION_READINESS.md §5.5 ("Wait for Condition")
 */
export function checkWaitCondition(condition: {
  type: 'text' | 'selector' | 'element_count' | 'url_change' | 'custom';
  value: string;
  timeout?: number;
  pollInterval?: number;
}): boolean {
  try {
    switch (condition.type) {
      case 'text':
        return document.body.textContent?.includes(condition.value) || false;
      
      case 'selector':
        return document.querySelector(condition.value) !== null;
      
      case 'element_count': {
        const parts = condition.value.split(':');
        const selector = parts[0];
        const minCount = parseInt(parts[1] || '1');
        const count = document.querySelectorAll(selector).length;
        return count >= minCount;
      }
      
      case 'url_change':
        return window.location.href.includes(condition.value);
      
      case 'custom':
        try {
          const fn = new Function('return ' + condition.value)();
          return fn();
        } catch (e) {
          return false;
        }
      
      default:
        return false;
    }
  } catch (error) {
    console.warn('Error checking wait condition:', error);
    return false;
  }
}

/**
 * Check if network is idle (no recent requests)
 * Used for dynamic stability check - waits for both DOM and network to be idle
 * 
 * Reference: PRODUCTION_READINESS.md §3.3 (The "Dynamic Stability" Check)
 */
export function checkNetworkIdle(): boolean {
  try {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) {
      // Performance API not available, assume idle
      return true;
    }
    
    const networkEntries = performance.getEntriesByType('resource');
    const now = Date.now();
    
    // Check for recent requests (within last 1000ms)
    const recentRequests = networkEntries.filter((entry: PerformanceEntry) => {
      if (entry instanceof PerformanceResourceTiming) {
        // Check if request completed recently
        const responseEnd = entry.responseEnd;
        return responseEnd > 0 && (now - responseEnd) < 1000;
      }
      return false;
    });
    
    // Network is idle if no recent requests
    return recentRequests.length === 0;
  } catch (error) {
    // If check fails, assume idle (don't block on network check failures)
    console.warn('Network idle check failed, assuming idle:', error);
    return true;
  }
}

/** Timestamp set before action execution; used to detect network activity during/after action. */
let networkObservationMark: number = 0;

/**
 * Mark the start of the observation window for network activity.
 * Call before executing an action; then use getDidNetworkOccurSinceMark() after stability wait.
 * Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: clientObservations
 */
export function setNetworkObservationMark(): void {
  networkObservationMark = Date.now();
}

/**
 * Returns true if any resource request completed after the last setNetworkObservationMark().
 * Used for clientObservations.didNetworkOccur to improve verification accuracy.
 */
export function getDidNetworkOccurSinceMark(): boolean {
  try {
    if (typeof performance === 'undefined' || !performance.getEntriesByType || networkObservationMark <= 0) {
      return false;
    }
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries) {
      if (entry instanceof PerformanceResourceTiming && entry.responseEnd > 0) {
        if (entry.responseEnd >= networkObservationMark) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.warn('getDidNetworkOccurSinceMark failed:', error);
    return false;
  }
}
