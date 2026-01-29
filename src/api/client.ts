/**
 * API Client for Thin Client Architecture
 * 
 * Handles all API communication with the backend server.
 * Uses Bearer token authentication stored in chrome.storage.local.
 * 
 * Reference: 
 * - THIN_CLIENT_ROADMAP.md §2.1 (Task 1: Authentication & API Client)
 * - THIN_CLIENT_ROADMAP.md §3.1 (Task 2: Runtime Knowledge Resolution)
 */

interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

interface LoginResponse {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  tenantId: string;
  tenantName: string;
}

interface SessionResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  tenantId: string;
  tenantName: string;
}

interface PreferencesResponse {
  preferences: {
    theme: 'light' | 'dark' | 'system';
  };
  syncedAt?: string;
}

interface PreferencesRequest {
  theme: 'light' | 'dark' | 'system';
  clientVersion?: string;
}

interface KnowledgeChunk {
  id: string;
  content: string;
  documentTitle: string;
  metadata?: Record<string, unknown>;
}

interface Citation {
  documentId: string;
  documentTitle: string;
  section?: string;
  page?: number;
}

interface ResolveKnowledgeResponse {
  allowed: true;
  domain: string;
  hasOrgKnowledge: boolean;
  context: KnowledgeChunk[];
  citations?: Citation[];
}

/**
 * DOM change information after action execution
 * Helps the server understand what changed on the page
 */
interface DOMChangeInfo {
  /** Number of elements that appeared */
  addedCount: number;
  /** Number of elements that disappeared */
  removedCount: number;
  /** Whether a dropdown/menu was detected */
  dropdownDetected: boolean;
  /** Dropdown options if detected (text/labels) */
  dropdownOptions?: string[];
  /** Time for DOM to stabilize in ms */
  stabilizationTime: number;
  /** URL before the action was executed (for detecting navigation) */
  previousUrl?: string;
  /** Whether the URL changed after the action */
  urlChanged?: boolean;
  /** Whether any network request occurred during/after the action (for verification) */
  didNetworkOccur?: boolean;
}

/**
 * Client observations witnessed by the extension after executing an action.
 * Optional; improves verification accuracy (avoids false "no change" failures).
 * Reference: Verification process doc — clientObservations (v3.0)
 */
export interface ClientObservations {
  /** Whether a network request completed during/after the action (e.g. API call) */
  didNetworkOccur?: boolean;
  /** Whether the DOM was mutated (elements added/removed/changed) */
  didDomMutate?: boolean;
  /** Whether the URL changed (navigation occurred) */
  didUrlChange?: boolean;
}

/**
 * Request body for POST /api/agent/interact
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
 * Reference: BACKEND_WEB_SEARCH_CHANGES.md §4.1 (Error Handling)
 */
interface AgentInteractRequest {
  url: string;
  query: string;
  dom: string;
  taskId?: string | null;
  sessionId?: string | null; // New: Session ID (replaces taskId for new structure)
  // New fields for error reporting
  lastActionStatus?: 'success' | 'failure' | 'pending';
  lastActionError?: {
    message: string;
    code: string; // e.g., 'ELEMENT_NOT_FOUND', 'TIMEOUT', 'NETWORK_ERROR'
    action: string; // The action that failed (e.g., "click(123)")
    elementId?: number; // Element ID that failed (if applicable)
  };
  lastActionResult?: {
    success: boolean;
    actualState?: string; // What actually happened (for verification)
  };
  // DOM change information after last action (helps server understand page state changes)
  domChanges?: DOMChangeInfo;
  /** Optional: extension-witnessed observations (improves verification accuracy) */
  clientObservations?: ClientObservations;
}

/**
 * Plan step structure from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.2 (Action Plan Structure)
 */
interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  toolType?: 'dom' | 'server';
  reasoning?: string;
  expectedOutcome?: string;
}

/**
 * Verification result from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.4 (Verification Result Model)
 */
interface VerificationResult {
  stepIndex: number;
  success: boolean;
  confidence: number; // 0-1 score
  expectedState?: string; // What was expected
  actualState?: string; // What actually happened
  reason: string; // Explanation of result
  timestamp?: string; // ISO timestamp (converted to Date on client)
}

/**
 * Self-correction result from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §9 (Self-Correction Architecture)
 */
interface CorrectionResult {
  stepIndex: number;
  strategy: string; // Correction strategy used (e.g., "ALTERNATIVE_SELECTOR", "ALTERNATIVE_TOOL", etc.)
  reason: string; // Why correction was needed
  attemptNumber: number; // Retry attempt number (1-indexed)
  originalStep?: string; // Original step description (if available)
  correctedStep?: string; // Corrected step description (if available)
  timestamp?: string; // ISO timestamp (converted to Date on client)
}

/**
 * Action plan structure from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.2 (Action Plan Structure)
 */
interface ActionPlan {
  steps: PlanStep[];
  currentStepIndex: number;
}

/**
 * Missing information field structure
 * Reference: REASONING_LAYER_IMPROVEMENTS.md v2.0
 */
export interface MissingInfoField {
  field: string; // e.g., "patient_dob"
  type: 'EXTERNAL_KNOWLEDGE' | 'PRIVATE_DATA'; // Can be found via search vs must ask user
  description: string; // Human-readable description
}

/**
 * Evidence structure supporting reasoning decisions
 * Reference: REASONING_LAYER_IMPROVEMENTS.md v2.0
 */
export interface ReasoningEvidence {
  sources: string[]; // e.g., ["chat_history", "page_dom", "rag_knowledge"]
  quality: 'high' | 'medium' | 'low'; // Quality of evidence
  gaps: string[]; // Missing information or uncertainties
}

/**
 * Reasoning data from the backend's reasoning layer (Enhanced v2.0)
 * Reference: REASONING_LAYER_IMPROVEMENTS.md v2.0
 */
export interface ReasoningData {
  source: 'MEMORY' | 'PAGE' | 'WEB_SEARCH' | 'ASK_USER';
  confidence: number; // 0.0 to 1.0 (REQUIRED) - Model's certainty based on evidence
  reasoning: string; // User-friendly explanation of the reasoning process
  missingInfo?: MissingInfoField[]; // Enhanced structure with type classification
  evidence?: ReasoningEvidence; // Evidence supporting the decision (REQUIRED in v2.0)
  // Iterative search information (for WEB_SEARCH source)
  searchIteration?: {
    attempt: number; // Current search attempt (1-indexed)
    maxAttempts: number; // Maximum attempts allowed
    refinedQuery?: string; // Refined query for this iteration
    evaluationResult?: {
      solved: boolean; // Whether results solved the problem
      shouldRetry: boolean; // Whether to retry with refined query
      shouldAskUser: boolean; // Whether to ask user instead
      confidence: number; // Confidence in evaluation
    };
  };
}

/**
 * Response from POST /api/agent/interact
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §7.2 (Response Format) - Orchestrator enhancements
 * Reference: REASONING_LAYER_IMPROVEMENTS.md - Reasoning layer enhancements
 */
interface NextActionResponse {
  thought: string;
  action: string; // e.g. "click(123)", "setValue(123, \"x\")", "finish()", "fail()", "ask_user()"
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  taskId?: string; // if server creates task; client should send this on later steps (legacy)
  sessionId?: string; // Session ID for new chat persistence structure
  hasOrgKnowledge?: boolean; // Optional. true when org-specific RAG was used; false when public-only
  // Orchestrator enhancements (optional, backward compatible)
  plan?: ActionPlan; // Action plan from orchestrator
  currentStep?: number; // Current step number (1-indexed)
  totalSteps?: number; // Total steps in plan
  status?: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | 'needs_user_input'; // Orchestrator status
  verification?: VerificationResult; // Verification result for previous step (Task 7)
  correction?: CorrectionResult; // Self-correction result for current step (Task 8)
  expectedOutcome?: string; // Expected outcome for next verification (Task 9)
  // Reasoning layer enhancements (optional, backward compatible)
  reasoning?: ReasoningData; // Reasoning metadata from the reasoning layer (Enhanced v2.0)
  userQuestion?: string; // Question to ask user (when status is 'needs_user_input')
  missingInformation?: MissingInfoField[]; // Enhanced missing information fields with type classification
  reasoningContext?: {
    searchPerformed?: boolean; // Whether web search was performed
    searchSummary?: string; // Summary of search results
    searchIterations?: number; // Number of search iterations performed
    finalQuery?: string; // Final refined query used
  };
}

// Get API base URL from environment or use default
// This is injected at build time via webpack's built-in dotenv feature (5.103.0+)
// Uses WEBPACK_ prefix for security (only prefixed variables are exposed)
// Fallback to NEXT_PUBLIC_API_BASE or API_BASE for compatibility
export const API_BASE = (
  process.env.WEBPACK_API_BASE || 
  process.env.NEXT_PUBLIC_API_BASE || 
  process.env.API_BASE || 
  'https://api.example.com'
).replace(/\/$/, '');

// Import rate limiter for exponential backoff and request deduplication
import { rateLimiter } from './rateLimiter';

/**
 * Custom error class for rate limit errors
 */
export class RateLimitError extends Error {
  public readonly resetAt: Date | null;
  public readonly retryAfter: number | null;

  constructor(message: string, resetAt?: Date | null, retryAfter?: number | null) {
    super(message);
    this.name = 'RateLimitError';
    this.resetAt = resetAt || null;
    this.retryAfter = retryAfter || null;
  }
}

/**
 * Custom error class for resource not found errors
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ApiClient {
  /**
   * Get stored access token from chrome.storage.local
   */
  private async getToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get('accessToken');
      return result.accessToken || null;
    } catch (error) {
      console.error('Error reading token from storage:', error);
      return null;
    }
  }

  /**
   * Handle API errors with appropriate status codes
   * Returns user-friendly error messages for common failure scenarios
   * Also records rate limits and errors for backoff management
   */
  private async handleError(response: Response, path: string): Promise<never> {
    const error: ApiError = {
      message: 'Unknown error',
      status: response.status,
    };

    let resetAt: string | undefined;
    let retryAfterHeader: string | null = null;

    try {
      const data = (await response.json()) as { 
        message?: string; 
        error?: string; 
        code?: string;
        resetAt?: string; // Rate limit reset time from response body
      };
      error.message = data.message || data.error || error.message;
      error.code = data.code;
      resetAt = data.resetAt;
    } catch {
      error.message = `HTTP ${response.status}: ${response.statusText}`;
    }

    // Extract Retry-After header if present
    retryAfterHeader = response.headers.get('Retry-After');

    // Handle 429 - Rate Limit Exceeded
    if (response.status === 429) {
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      const resetAtDate = resetAt ? new Date(resetAt) : null;
      
      // Record rate limit for backoff
      rateLimiter.recordRateLimit(path, resetAt, retryAfterSeconds);
      
      throw new RateLimitError(
        `Rate limit exceeded. ${resetAtDate ? `Resets at ${resetAtDate.toISOString()}` : 'Please try again later.'}`,
        resetAtDate,
        retryAfterSeconds || null
      );
    }

    // Handle 404 - Resource Not Found
    if (response.status === 404) {
      // Record 404 to prevent hammering (session might not exist)
      rateLimiter.recordClientError(path, 404);
      throw new NotFoundError(`Resource not found: ${path}`);
    }

    // Handle 401 - clear token and show login
    if (response.status === 401) {
      await chrome.storage.local.remove(['accessToken', 'expiresAt', 'user', 'tenantId', 'tenantName']);
      // Trigger login UI (will be handled by App.tsx)
      throw new Error('UNAUTHORIZED');
    }

    // Handle 403 - domain not allowed (though this shouldn't happen per §1.4)
    if (response.status === 403) {
      if (error.code === 'DOMAIN_NOT_ALLOWED') {
        throw new Error('DOMAIN_NOT_ALLOWED');
      }
      throw new Error(`FORBIDDEN: ${error.message}`);
    }

    // Handle 5xx - Server errors (use backoff)
    if (response.status >= 500) {
      rateLimiter.recordServerError(path);
      throw new Error(`SERVER_ERROR: ${error.message}`);
    }

    // Handle 400 - Bad Request (includes max retries, validation errors, etc.)
    if (response.status === 400) {
      const lowerMessage = error.message.toLowerCase();
      
      // Max retries exceeded - task failed after multiple attempts
      if (lowerMessage.includes('max retries') || lowerMessage.includes('maximum retries') || 
          error.code === 'MAX_RETRIES_EXCEEDED') {
        throw new Error('MAX_RETRIES_EXCEEDED: The task could not be completed after multiple attempts. The page may have changed or the action could not be verified. Please try again or simplify your request.');
      }
      
      // Verification failed
      if (lowerMessage.includes('verification failed') || error.code === 'VERIFICATION_FAILED') {
        throw new Error('VERIFICATION_FAILED: The action was attempted but could not be verified. The page may not have responded as expected.');
      }
      
      // Invalid action
      if (lowerMessage.includes('invalid action') || error.code === 'INVALID_ACTION') {
        throw new Error('INVALID_ACTION: The requested action is not valid for this page.');
      }
      
      // Element not found
      if (lowerMessage.includes('element not found') || lowerMessage.includes('not found') ||
          error.code === 'ELEMENT_NOT_FOUND') {
        throw new Error('ELEMENT_NOT_FOUND: Could not find the element to interact with. The page may have changed.');
      }
      
      // Generic 400 with original message
      throw new Error(`BAD_REQUEST: ${error.message}`);
    }

    throw error;
  }

  /**
   * Generic request method with Bearer token authentication
   * Includes rate limiting, exponential backoff, and request deduplication
   * Optionally logs network calls for debug panel
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    logger?: (log: {
      method: string;
      endpoint: string;
      request: { body?: unknown; headers?: Record<string, string> };
      response: { body?: unknown; status: number; headers?: Record<string, string> };
      duration: number;
      error?: string;
    }) => void,
    options?: {
      skipRateLimitCheck?: boolean; // For critical requests that should not be rate-limited
      skipDeduplication?: boolean; // For requests that should not be deduplicated
    }
  ): Promise<T> {
    const token = await this.getToken();
    
    // Allow login endpoint without token
    if (!token && path !== '/api/v1/auth/login') {
      throw new Error('UNAUTHORIZED');
    }

    // === RATE LIMIT CHECK ===
    // Check if we should wait before making this request
    if (!options?.skipRateLimitCheck) {
      // Check if max retries exceeded
      if (rateLimiter.hasExceededMaxRetries(path)) {
        const waitTime = rateLimiter.getWaitTime(path);
        if (waitTime > 0) {
          console.warn(`[ApiClient] Max retries exceeded for ${path}, blocking for ${waitTime}ms`);
          throw new RateLimitError(
            `Too many failed requests. Please wait before retrying.`,
            new Date(Date.now() + waitTime),
            Math.ceil(waitTime / 1000)
          );
        }
      }

      const waitTime = rateLimiter.getWaitTime(path);
      if (waitTime > 0) {
        console.log(`[ApiClient] Rate limited, waiting ${waitTime}ms before request to ${path}`);
        await rateLimiter.sleep(waitTime);
      }
    }

    // === REQUEST DEDUPLICATION ===
    // For GET requests, check if an identical request is already in-flight
    if (method === 'GET' && !options?.skipDeduplication) {
      const inFlightRequest = rateLimiter.getInFlightRequest<T>(method, path, body);
      if (inFlightRequest) {
        console.debug(`[ApiClient] Deduplicating in-flight request: ${method} ${path}`);
        return inFlightRequest;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Masked headers for logging (don't expose full token)
    const maskedHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      maskedHeaders['Authorization'] = `Bearer ${token.substring(0, 10)}...`;
    }

    const startTime = Date.now();
    let responseBody: T | undefined;
    let responseStatus = 0;
    let responseHeaders: Record<string, string> = {};
    let errorMessage: string | undefined;

    // Create the request promise
    const requestPromise = (async (): Promise<T> => {
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          credentials: 'omit', // Chrome extension doesn't use cookies
        });

        responseStatus = response.status;
        
        // Extract response headers (limited set for security)
        response.headers.forEach((value, key) => {
          if (['content-type', 'content-length', 'retry-after'].includes(key.toLowerCase())) {
            responseHeaders[key] = value;
          }
        });

        if (!response.ok) {
          await this.handleError(response, path);
        }

        // Record success - clear any rate limit state
        rateLimiter.recordSuccess(path);

        // Handle 204 No Content
        if (response.status === 204) {
          responseBody = undefined as T;
        } else {
          responseBody = (await response.json()) as T;
        }

        const duration = Date.now() - startTime;

        // Log successful request
        if (logger) {
          logger({
            method,
            endpoint: path,
            request: {
              body: body ? (typeof body === 'string' ? body : JSON.stringify(body).substring(0, 1000)) : undefined,
              headers: maskedHeaders,
            },
            response: {
              body: responseBody ? (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody).substring(0, 1000)) : undefined,
              status: responseStatus,
              headers: responseHeaders,
            },
            duration,
          });
        }

        return responseBody;
      } catch (error) {
        const duration = Date.now() - startTime;
        errorMessage = error instanceof Error ? error.message : String(error);

        // Log failed request
        if (logger) {
          logger({
            method,
            endpoint: path,
            request: {
              body: body ? (typeof body === 'string' ? body : JSON.stringify(body).substring(0, 1000)) : undefined,
              headers: maskedHeaders,
            },
            response: {
              body: undefined,
              status: responseStatus || 0,
              headers: responseHeaders,
            },
            duration,
            error: errorMessage,
          });
        }

        // Re-throw specific error types
        if (error instanceof RateLimitError || error instanceof NotFoundError) {
          throw error;
        }
        
        if (error instanceof Error && error.message === 'UNAUTHORIZED') {
          throw error;
        }

        // Network errors - record for potential backoff
        if (!responseStatus || responseStatus === 0) {
          rateLimiter.recordServerError(path);
        }

        throw new Error(`Network error: ${errorMessage}`);
      }
    })();

    // Register in-flight request for deduplication (GET only)
    if (method === 'GET' && !options?.skipDeduplication) {
      rateLimiter.setInFlightRequest(method, path, requestPromise, body);
    }

    return requestPromise;
  }

  /**
   * Login with email and password
   * Stores token and user info in chrome.storage.local
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('POST', '/api/v1/auth/login', {
      email,
      password,
    });

    // Store token and user info
    await chrome.storage.local.set({
      accessToken: response.accessToken,
      expiresAt: response.expiresAt,
      user: response.user,
      tenantId: response.tenantId,
      tenantName: response.tenantName,
    });

    return response;
  }

  /**
   * Check current session
   * Returns user and tenant info if token is valid
   */
  async getSession(): Promise<SessionResponse> {
    return this.request<SessionResponse>('GET', '/api/v1/auth/session');
  }

  /**
   * Logout - invalidates token and clears local storage
   */
  async logout(): Promise<void> {
    try {
      await this.request('POST', '/api/v1/auth/logout');
    } catch (error) {
      // Continue with clearing local storage even if logout request fails
      console.error('Logout request failed:', error);
    } finally {
      // Always clear local storage
      await chrome.storage.local.remove([
        'accessToken',
        'expiresAt',
        'user',
        'tenantId',
        'tenantName',
      ]);
    }
  }

  /**
   * Get stored token (public method for components that need it)
   */
  async getStoredToken(): Promise<string | null> {
    return this.getToken();
  }

  /**
   * Resolve knowledge for a given URL
   * Returns knowledge context and citations for internal use and debugging
   * 
   * Extracts only the domain (hostname) from the URL before sending to backend.
   * 
   * Reference: THIN_CLIENT_ROADMAP.md §3.1 (Task 2: Runtime Knowledge Resolution)
   * Reference: SERVER_SIDE_AGENT_ARCH.md §5 (GET /api/knowledge/resolve)
   */
  async knowledgeResolve(
    url: string,
    query?: string,
    logger?: (log: {
      method: string;
      endpoint: string;
      request: { body?: unknown; headers?: Record<string, string> };
      response: { body?: unknown; status: number; headers?: Record<string, string> };
      duration: number;
      error?: string;
    }) => void
  ): Promise<ResolveKnowledgeResponse> {
    // Extract only the domain (hostname) from the URL
    let domain: string;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (error) {
      // If URL parsing fails, use the original URL as fallback
      domain = url;
    }
    
    const params = new URLSearchParams({ url: domain });
    if (query) {
      params.append('query', query);
    }
    
    return this.request<ResolveKnowledgeResponse>(
      'GET',
      `/api/knowledge/resolve?${params.toString()}`,
      undefined,
      logger
    );
  }

  /**
   * Interact with agent to get next action
   * Sends DOM, URL, query, and optional taskId to server
   * Returns next action (click/setValue/finish/fail) with thought and usage
   * 
   * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
   * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
   */
  async agentInteract(
    url: string,
    query: string,
    dom: string,
    taskId?: string | null,
    sessionId?: string | null,
    lastActionStatus?: 'success' | 'failure' | 'pending',
    lastActionError?: {
      message: string;
      code: string;
      action: string;
      elementId?: number;
    },
    lastActionResult?: {
      success: boolean;
      actualState?: string;
    },
    logger?: (log: {
      method: string;
      endpoint: string;
      request: { body?: unknown; headers?: Record<string, string> };
      response: { body?: unknown; status: number; headers?: Record<string, string> };
      duration: number;
      error?: string;
    }) => void,
    domChanges?: DOMChangeInfo,
    clientObservations?: ClientObservations
  ): Promise<NextActionResponse> {
    const body: AgentInteractRequest = {
      url,
      query,
      dom: dom.substring(0, 50000), // Truncate large DOM for logging
      taskId: taskId || undefined,
      sessionId: sessionId || undefined,
      lastActionStatus,
      lastActionError,
      lastActionResult,
      domChanges,
      clientObservations,
    };

    return this.request<NextActionResponse>('POST', '/api/agent/interact', body, logger);
  }

  /**
   * Get user preferences
   * Returns theme and other user preferences from the backend
   * 
   * Reference: THIN_SERVER_TO_BE_ROADMAP.md (Settings API)
   */
  async getPreferences(): Promise<PreferencesResponse> {
    return this.request<PreferencesResponse>('GET', '/api/v1/user/preferences');
  }

  /**
   * Update user preferences
   * Saves theme and other preferences to the backend
   * 
   * Reference: THIN_SERVER_TO_BE_ROADMAP.md (Settings API)
   */
  async updatePreferences(preferences: PreferencesRequest): Promise<PreferencesResponse> {
    return this.request<PreferencesResponse>('POST', '/api/v1/user/preferences', preferences);
  }

  /**
   * Get session messages
   * Retrieves conversation history for a session
   * 
   * Reference: BACKEND_WEB_SEARCH_CHANGES.md §3.2 (Task 3: Chat Persistence)
   */
  async getSessionMessages(
    sessionId: string,
    limit?: number,
    since?: Date
  ): Promise<{
    sessionId: string;
    messages: Array<{
        messageId: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        actionPayload?: object;
        actionString?: string;
        status?: 'success' | 'failure' | 'pending';
        error?: object;
        timestamp: string;
        /** Backend ordering; sort by this when available (ascending = oldest first) */
        sequenceNumber?: number;
        metadata?: object;
      }>;
      total: number;
    }> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (since) params.append('since', since.toISOString());
    
    const queryString = params.toString();
    const path = `/api/session/${sessionId}/messages${queryString ? `?${queryString}` : ''}`;
    
    return this.request<{
      sessionId: string;
      messages: Array<{
        messageId: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        actionPayload?: object;
        actionString?: string;
        status?: 'success' | 'failure' | 'pending';
        error?: object;
        timestamp: string;
        sequenceNumber?: number;
        metadata?: object;
      }>;
      total: number;
    }>('GET', path);
  }

  /**
   * Get active task for a session (recovery fallback when chrome.storage fails).
   * Returns 200 with taskId when an active task exists for the session and URL; 404 when none.
   * Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: taskId Persistence
   */
  async getActiveTask(
    sessionId: string,
    currentTabUrl: string
  ): Promise<{
    taskId: string;
    query: string;
    status: string;
    currentStepIndex: number;
    createdAt: string;
    updatedAt: string;
  } | null> {
    try {
      const params = new URLSearchParams({ url: currentTabUrl });
      const path = `/api/session/${encodeURIComponent(sessionId)}/task/active?${params.toString()}`;
      const result = await this.request<{
        taskId: string;
        query: string;
        status: string;
        currentStepIndex: number;
        createdAt: string;
        updatedAt: string;
      }>('GET', path);
      return result;
    } catch (error: unknown) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  /**
   * Get latest session
   * Gets the most recent active session for the user
   * 
   * Reference: BACKEND_WEB_SEARCH_CHANGES.md §3.2 (Task 3: Chat Persistence)
   */
  async getLatestSession(status?: string): Promise<{
    sessionId: string;
    url: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    
    const queryString = params.toString();
    const path = `/api/session/latest${queryString ? `?${queryString}` : ''}`;
    
    return this.request<{
      sessionId: string;
      url: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      messageCount: number;
    }>('GET', path);
  }

  /**
   * List all sessions for the authenticated user
   * Supports filtering by status and pagination
   * 
   * Reference: SERVER_SIDE_AGENT_ARCH.md §4.8.2 (GET /api/session)
   */
  async listSessions(options?: {
    status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    data: {
      sessions: Array<{
        sessionId: string;
        url: string;
        status: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
        createdAt: string;
        updatedAt: string;
        messageCount: number;
        metadata?: {
          taskType?: string;
          initialQuery?: string;
          [key: string]: unknown;
        };
      }>;
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    };
  }> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.includeArchived !== undefined) params.append('includeArchived', String(options.includeArchived));
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    
    const queryString = params.toString();
    const path = `/api/session${queryString ? `?${queryString}` : ''}`;
    
    return this.request<{
      success: boolean;
      data: {
        sessions: Array<{
          sessionId: string;
          url: string;
          status: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
          createdAt: string;
          updatedAt: string;
          messageCount: number;
          metadata?: {
            taskType?: string;
            initialQuery?: string;
            [key: string]: unknown;
          };
        }>;
        pagination: {
          total: number;
          limit: number;
          offset: number;
          hasMore: boolean;
        };
      };
    }>('GET', path);
  }

  /**
   * Archive a session
   * Marks a session as archived (excluded from Chrome extension queries)
   * 
   * Reference: SERVER_SIDE_AGENT_ARCH.md §4.8.3 (POST /api/session)
   */
  async archiveSession(sessionId: string): Promise<{
    success: boolean;
    data: {
      sessionId: string;
      status: 'archived';
      message: string;
    };
  }> {
    return this.request<{
      success: boolean;
      data: {
        sessionId: string;
        status: 'archived';
        message: string;
      };
    }>('POST', '/api/session', { sessionId });
  }
}

export const apiClient = new ApiClient();
export type { 
  ResolveKnowledgeResponse, 
  KnowledgeChunk, 
  Citation, 
  NextActionResponse, 
  AgentInteractRequest,
  PreferencesResponse,
  PreferencesRequest,
  DOMChangeInfo,
  ClientObservations
};
