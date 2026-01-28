/**
 * Rate Limiter and Request Manager for API Calls
 * 
 * Implements:
 * - Exponential backoff with jitter for 429 responses
 * - Request deduplication to prevent concurrent identical requests
 * - Respects Retry-After headers and resetAt timestamps
 * - Global and per-endpoint rate limiting
 * 
 * Reference: Production best practices for API rate limiting
 */

/**
 * Rate limit state for a specific endpoint
 */
interface RateLimitState {
  /** When the rate limit resets (unix timestamp) */
  resetAt: number;
  /** Number of consecutive failures */
  failureCount: number;
  /** Current backoff delay in ms */
  backoffMs: number;
  /** Whether this endpoint is currently blocked */
  blocked: boolean;
}

/**
 * In-flight request tracking
 */
interface InFlightRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

/**
 * Backoff configuration
 */
interface BackoffConfig {
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 60000 = 1 minute) */
  maxDelayMs: number;
  /** Multiplier for each retry (default: 2) */
  multiplier: number;
  /** Maximum jitter in ms (default: 1000) */
  maxJitterMs: number;
  /** Maximum retry attempts before giving up (default: 10) */
  maxRetries: number;
}

const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxJitterMs: 1000,
  maxRetries: 10,
};

/**
 * Rate limiter class for managing API request rate limiting
 */
class RateLimiter {
  private rateLimitStates: Map<string, RateLimitState> = new Map();
  private inFlightRequests: Map<string, InFlightRequest<unknown>> = new Map();
  private config: BackoffConfig;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  }

  /**
   * Generate a cache key for deduplication
   */
  private getCacheKey(method: string, path: string, body?: unknown): string {
    const bodyHash = body ? JSON.stringify(body).substring(0, 100) : '';
    return `${method}:${path}:${bodyHash}`;
  }

  /**
   * Get endpoint key for rate limiting (strips query params and IDs for grouping)
   */
  private getEndpointKey(path: string): string {
    // Group similar endpoints together (e.g., /api/session/*/messages -> /api/session/messages)
    return path
      .replace(/\/[a-f0-9-]{36}/gi, '/:id') // Replace UUIDs
      .replace(/\?.*$/, ''); // Remove query params
  }

  /**
   * Calculate backoff delay with exponential increase and jitter
   */
  private calculateBackoff(failureCount: number): number {
    const exponentialDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.multiplier, failureCount - 1),
      this.config.maxDelayMs
    );
    
    // Add jitter (random delay) to prevent thundering herd
    const jitter = Math.random() * this.config.maxJitterMs;
    
    return exponentialDelay + jitter;
  }

  /**
   * Check if we should wait before making a request to this endpoint
   * Returns the wait time in ms, or 0 if no wait needed
   */
  getWaitTime(path: string): number {
    const endpointKey = this.getEndpointKey(path);
    const state = this.rateLimitStates.get(endpointKey);
    
    if (!state) {
      return 0;
    }

    const now = Date.now();

    // Check if we're past the reset time
    if (state.resetAt && now >= state.resetAt) {
      // Reset the state
      this.rateLimitStates.delete(endpointKey);
      return 0;
    }

    // If blocked due to rate limit response, wait until resetAt
    if (state.blocked && state.resetAt) {
      return Math.max(0, state.resetAt - now);
    }

    // Otherwise use backoff delay
    return state.backoffMs;
  }

  /**
   * Check if the endpoint has exceeded max retries
   */
  hasExceededMaxRetries(path: string): boolean {
    const endpointKey = this.getEndpointKey(path);
    const state = this.rateLimitStates.get(endpointKey);
    return state ? state.failureCount >= this.config.maxRetries : false;
  }

  /**
   * Record a successful response - reset rate limit state
   */
  recordSuccess(path: string): void {
    const endpointKey = this.getEndpointKey(path);
    this.rateLimitStates.delete(endpointKey);
  }

  /**
   * Record a rate limit response (429)
   * @param path - API path
   * @param resetAt - When the rate limit resets (from response)
   * @param retryAfter - Retry-After header value in seconds
   */
  recordRateLimit(path: string, resetAt?: string | Date, retryAfter?: number): void {
    const endpointKey = this.getEndpointKey(path);
    const existing = this.rateLimitStates.get(endpointKey) || {
      resetAt: 0,
      failureCount: 0,
      backoffMs: 0,
      blocked: false,
    };

    existing.failureCount += 1;
    existing.blocked = true;

    // Use resetAt from response body if provided
    if (resetAt) {
      const resetTime = typeof resetAt === 'string' ? new Date(resetAt).getTime() : resetAt.getTime();
      existing.resetAt = resetTime;
      existing.backoffMs = Math.max(0, resetTime - Date.now());
    } else if (retryAfter) {
      // Use Retry-After header (in seconds)
      existing.resetAt = Date.now() + retryAfter * 1000;
      existing.backoffMs = retryAfter * 1000;
    } else {
      // Fall back to exponential backoff
      existing.backoffMs = this.calculateBackoff(existing.failureCount);
      existing.resetAt = Date.now() + existing.backoffMs;
    }

    this.rateLimitStates.set(endpointKey, existing);

    console.warn(`[RateLimiter] Rate limit recorded for ${endpointKey}:`, {
      failureCount: existing.failureCount,
      backoffMs: existing.backoffMs,
      resetAt: new Date(existing.resetAt).toISOString(),
    });
  }

  /**
   * Record a client error (404, etc.) - should not retry
   */
  recordClientError(path: string, status: number): void {
    const endpointKey = this.getEndpointKey(path);
    
    // For 404 (not found), set a longer backoff to prevent hammering
    if (status === 404) {
      this.rateLimitStates.set(endpointKey, {
        resetAt: Date.now() + 30000, // 30 seconds before retry
        failureCount: this.config.maxRetries, // Prevent immediate retries
        backoffMs: 30000,
        blocked: true,
      });
      
      console.warn(`[RateLimiter] Resource not found for ${endpointKey}, blocking for 30s`);
    }
  }

  /**
   * Record a server error (5xx) - use exponential backoff
   */
  recordServerError(path: string): void {
    const endpointKey = this.getEndpointKey(path);
    const existing = this.rateLimitStates.get(endpointKey) || {
      resetAt: 0,
      failureCount: 0,
      backoffMs: 0,
      blocked: false,
    };

    existing.failureCount += 1;
    existing.backoffMs = this.calculateBackoff(existing.failureCount);
    existing.resetAt = Date.now() + existing.backoffMs;
    existing.blocked = false; // Server errors use backoff, not hard block

    this.rateLimitStates.set(endpointKey, existing);
  }

  /**
   * Check if an identical request is already in flight
   */
  isRequestInFlight(method: string, path: string, body?: unknown): boolean {
    const key = this.getCacheKey(method, path, body);
    const inFlight = this.inFlightRequests.get(key);
    
    if (!inFlight) {
      return false;
    }

    // Consider request stale after 30 seconds
    if (Date.now() - inFlight.timestamp > 30000) {
      this.inFlightRequests.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get an in-flight request if one exists
   */
  getInFlightRequest<T>(method: string, path: string, body?: unknown): Promise<T> | null {
    const key = this.getCacheKey(method, path, body);
    const inFlight = this.inFlightRequests.get(key);
    
    if (!inFlight || Date.now() - inFlight.timestamp > 30000) {
      return null;
    }

    return inFlight.promise as Promise<T>;
  }

  /**
   * Register an in-flight request
   */
  setInFlightRequest<T>(method: string, path: string, promise: Promise<T>, body?: unknown): void {
    const key = this.getCacheKey(method, path, body);
    this.inFlightRequests.set(key, {
      promise,
      timestamp: Date.now(),
    });

    // Clean up when request completes
    promise.finally(() => {
      // Small delay before cleanup to handle rapid sequential requests
      setTimeout(() => {
        const current = this.inFlightRequests.get(key);
        if (current && current.promise === promise) {
          this.inFlightRequests.delete(key);
        }
      }, 100);
    });
  }

  /**
   * Sleep for a specified duration
   */
  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current state for debugging
   */
  getState(): { rateLimits: Record<string, RateLimitState>; inFlight: string[] } {
    const rateLimits: Record<string, RateLimitState> = {};
    this.rateLimitStates.forEach((value, key) => {
      rateLimits[key] = value;
    });

    return {
      rateLimits,
      inFlight: Array.from(this.inFlightRequests.keys()),
    };
  }

  /**
   * Clear all state (useful for testing or logout)
   */
  clear(): void {
    this.rateLimitStates.clear();
    this.inFlightRequests.clear();
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

// Export types
export type { RateLimitState, BackoffConfig };
