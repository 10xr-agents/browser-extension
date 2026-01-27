import { SPADEWORKS_ELEMENT_SELECTOR } from '../../constants';

function isInteractive(
  element: HTMLElement,
  style: CSSStyleDeclaration
): boolean {
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

function traverseDOM(node: Node, pageElements: HTMLElement[]) {
  const clonedNode = node.cloneNode(false) as Node;

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
  }

  node.childNodes.forEach((child) => {
    const result = traverseDOM(child, pageElements);
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
  const result = traverseDOM(document.documentElement, currentElements);
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
}

/**
 * Get a snapshot of all interactive elements on the page
 * Used for tracking what changed after an action (e.g., dropdown appearing)
 */
export function getInteractiveElementSnapshot(): ElementSnapshotInfo[] {
  const elements: ElementSnapshotInfo[] = [];
  
  // Query all interactive elements (including those that may have just appeared)
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
    
    elements.push({
      id,
      tagName: el.tagName,
      role,
      name,
      text,
      interactive: isInteractive(el, style) || el.hasAttribute('role'),
    });
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
