/**
 * DOM Stability Waiter - Smart Waiting for Dynamic Pages
 * 
 * Modern sites (Google, React apps, SPAs) often load content progressively.
 * Extracting the DOM too early results in empty or incomplete data.
 * 
 * This module provides intelligent waiting strategies:
 * 1. Wait for DOM to stop changing (mutations settle)
 * 2. Wait for network to be idle
 * 3. Wait with configurable timeouts
 * 
 * Reference: SEMANTIC_JSON_PROTOCOL.md
 */

/**
 * Configuration for DOM stability waiting
 */
export interface DomWaitConfig {
  /** Maximum time to wait for stability in ms (default: 3000) */
  timeout?: number;
  
  /** Time without mutations to consider DOM stable in ms (default: 300) */
  stabilityThreshold?: number;
  
  /** Whether to also wait for network idle (default: true) */
  waitForNetwork?: boolean;
  
  /** Time without network activity to consider network idle in ms (default: 500) */
  networkIdleThreshold?: number;
  
  /** Minimum wait time even if stable immediately (default: 100) */
  minWait?: number;
}

const DEFAULT_CONFIG: Required<DomWaitConfig> = {
  timeout: 3000,
  stabilityThreshold: 300,
  waitForNetwork: true,
  networkIdleThreshold: 500,
  minWait: 100,
};

/**
 * Wait for the DOM to become stable (no mutations for a period of time).
 * 
 * This is essential for dynamic sites that:
 * - Hydrate after initial HTML load (React, Vue, Svelte)
 * - Load content via AJAX after page load
 * - Animate elements into view
 * - Progressively render search results (Google)
 * 
 * @param config - Configuration options
 * @returns Promise that resolves when DOM is stable
 */
export function waitForDomStability(config: DomWaitConfig = {}): Promise<{
  stable: boolean;
  waitTimeMs: number;
  mutationCount: number;
}> {
  const {
    timeout,
    stabilityThreshold,
    waitForNetwork,
    networkIdleThreshold,
    minWait,
  } = { ...DEFAULT_CONFIG, ...config };
  
  return new Promise(resolve => {
    const startTime = Date.now();
    let lastMutationTime = Date.now();
    let lastNetworkTime = Date.now();
    let mutationCount = 0;
    let isStable = false;
    let observer: MutationObserver | null = null;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    
    /**
     * Clean up and resolve
     */
    function finish(stable: boolean): void {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      
      const waitTimeMs = Date.now() - startTime;
      console.debug(`[DomWait] Finished: stable=${stable}, waitTime=${waitTimeMs}ms, mutations=${mutationCount}`);
      
      resolve({
        stable,
        waitTimeMs,
        mutationCount,
      });
    }
    
    /**
     * Check if we've reached stability
     */
    function checkStability(): void {
      const now = Date.now();
      const timeSinceStart = now - startTime;
      const timeSinceMutation = now - lastMutationTime;
      const timeSinceNetwork = now - lastNetworkTime;
      
      // Enforce minimum wait
      if (timeSinceStart < minWait) {
        return;
      }
      
      // Check timeout
      if (timeSinceStart >= timeout) {
        console.debug('[DomWait] Timeout reached');
        finish(false);
        return;
      }
      
      // Check DOM stability
      const domStable = timeSinceMutation >= stabilityThreshold;
      
      // Check network stability (if enabled)
      let networkStable = true;
      if (waitForNetwork) {
        networkStable = timeSinceNetwork >= networkIdleThreshold;
        
        // Also check Performance API for recent network activity
        if (networkStable && typeof performance !== 'undefined' && performance.getEntriesByType) {
          try {
            const entries = performance.getEntriesByType('resource');
            const recentEntries = entries.filter((entry: PerformanceEntry) => {
              if (entry instanceof PerformanceResourceTiming) {
                return entry.responseEnd > 0 && (now - entry.responseEnd) < networkIdleThreshold;
              }
              return false;
            });
            networkStable = recentEntries.length === 0;
          } catch {
            // Performance API failed, assume network stable
          }
        }
      }
      
      if (domStable && networkStable) {
        console.debug(`[DomWait] Stability reached: DOM stable for ${timeSinceMutation}ms, network stable for ${timeSinceNetwork}ms`);
        finish(true);
      }
    }
    
    /**
     * Handle mutations
     */
    function handleMutations(mutations: MutationRecord[]): void {
      // Count mutations (for debugging)
      mutationCount += mutations.length;
      
      // Update last mutation time
      lastMutationTime = Date.now();
    }
    
    // Guard against invalid document state
    if (typeof document === 'undefined' || !document.body) {
      console.warn('[DomWait] Document not ready, resolving immediately');
      resolve({
        stable: false,
        waitTimeMs: 0,
        mutationCount: 0,
      });
      return;
    }
    
    // Set up MutationObserver
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,      // Watch for added/removed nodes
      subtree: true,        // Watch entire subtree
      attributes: true,     // Watch attribute changes
      characterData: true,  // Watch text content changes
    });
    
    // Set up network activity tracking via PerformanceObserver
    if (waitForNetwork && typeof PerformanceObserver !== 'undefined') {
      try {
        const perfObserver = new PerformanceObserver(() => {
          lastNetworkTime = Date.now();
        });
        perfObserver.observe({ entryTypes: ['resource'] });
      } catch {
        // PerformanceObserver not supported, rely on Performance API polling
      }
    }
    
    // Set up periodic stability check
    checkInterval = setInterval(checkStability, 50);
    
    // Do initial check
    checkStability();
  });
}

/**
 * Wait for a specific condition to be true
 * 
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in ms
 * @param pollInterval - How often to check the condition in ms
 * @returns Promise that resolves when condition is met or timeout
 */
export function waitForCondition(
  condition: () => boolean,
  timeout = 5000,
  pollInterval = 100
): Promise<boolean> {
  return new Promise(resolve => {
    const startTime = Date.now();
    
    function check(): void {
      // Check if condition is met
      try {
        if (condition()) {
          resolve(true);
          return;
        }
      } catch (error) {
        console.debug('[DomWait] Condition check threw:', error);
      }
      
      // Check timeout
      if (Date.now() - startTime >= timeout) {
        resolve(false);
        return;
      }
      
      // Schedule next check
      setTimeout(check, pollInterval);
    }
    
    check();
  });
}

/**
 * Wait for an element to appear in the DOM
 * 
 * @param selector - CSS selector for the element
 * @param timeout - Maximum time to wait in ms
 * @returns Promise that resolves with the element or null
 */
export function waitForElement(
  selector: string,
  timeout = 5000
): Promise<Element | null> {
  return new Promise(resolve => {
    // Check if element already exists
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    
    const startTime = Date.now();
    let observer: MutationObserver | null = null;
    
    function cleanup(): void {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    
    // Set up observer
    observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        cleanup();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    
    // Set up timeout
    setTimeout(() => {
      cleanup();
      // Final check
      const element = document.querySelector(selector);
      resolve(element);
    }, timeout);
  });
}

/**
 * Wait for text content to appear on the page
 * 
 * @param text - Text to search for (case-insensitive)
 * @param timeout - Maximum time to wait in ms
 * @returns Promise that resolves when text is found or timeout
 */
export function waitForText(
  text: string,
  timeout = 5000
): Promise<boolean> {
  const textLower = text.toLowerCase();
  
  return waitForCondition(
    () => document.body?.textContent?.toLowerCase().includes(textLower) ?? false,
    timeout
  );
}

/**
 * Wait for the page to be fully loaded and interactive
 * 
 * This combines multiple stability checks:
 * 1. document.readyState is 'complete'
 * 2. DOM has stopped mutating
 * 3. Network is idle
 * 
 * @param config - Configuration options
 * @returns Promise that resolves when page is ready
 */
export async function waitForPageReady(config: DomWaitConfig = {}): Promise<{
  ready: boolean;
  waitTimeMs: number;
}> {
  const startTime = Date.now();
  
  // 1. Wait for document to be ready
  if (document.readyState !== 'complete') {
    await new Promise<void>(resolve => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      
      const handler = (): void => {
        if (document.readyState === 'complete') {
          document.removeEventListener('readystatechange', handler);
          resolve();
        }
      };
      
      document.addEventListener('readystatechange', handler);
      
      // Timeout fallback
      setTimeout(() => {
        document.removeEventListener('readystatechange', handler);
        resolve();
      }, config.timeout ?? DEFAULT_CONFIG.timeout);
    });
  }
  
  // 2. Wait for DOM stability
  const stabilityResult = await waitForDomStability(config);
  
  return {
    ready: stabilityResult.stable,
    waitTimeMs: Date.now() - startTime,
  };
}

/**
 * Sleep for a specified duration
 * 
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
