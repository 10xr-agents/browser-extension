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
 * Request body for POST /api/agent/interact
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
 */
interface AgentInteractRequest {
  url: string;
  query: string;
  dom: string;
  taskId?: string | null;
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
 * Response from POST /api/agent/interact
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §7.2 (Response Format) - Orchestrator enhancements
 */
interface NextActionResponse {
  thought: string;
  action: string; // e.g. "click(123)", "setValue(123, \"x\")", "finish()", "fail()"
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  taskId?: string; // if server creates task; client should send this on later steps
  hasOrgKnowledge?: boolean; // Optional. true when org-specific RAG was used; false when public-only
  // Orchestrator enhancements (optional, backward compatible)
  plan?: ActionPlan; // Action plan from orchestrator
  currentStep?: number; // Current step number (1-indexed)
  totalSteps?: number; // Total steps in plan
  status?: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed'; // Orchestrator status
  verification?: VerificationResult; // Verification result for previous step (Task 7)
  correction?: CorrectionResult; // Self-correction result for current step (Task 8)
  expectedOutcome?: string; // Expected outcome for next verification (Task 9)
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
   */
  private async handleError(response: Response): Promise<never> {
    const error: ApiError = {
      message: 'Unknown error',
      status: response.status,
    };

    try {
      const data = (await response.json()) as { message?: string; error?: string; code?: string };
      error.message = data.message || data.error || error.message;
      error.code = data.code;
    } catch {
      error.message = `HTTP ${response.status}: ${response.statusText}`;
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

    throw error;
  }

  /**
   * Generic request method with Bearer token authentication
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
    }) => void
  ): Promise<T> {
    const token = await this.getToken();
    
    // Allow login endpoint without token
    if (!token && path !== '/api/v1/auth/login') {
      throw new Error('UNAUTHORIZED');
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
        if (['content-type', 'content-length'].includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      if (!response.ok) {
        await this.handleError(response);
      }

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

      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        throw error;
      }
      // Network errors
      throw new Error(`Network error: ${errorMessage}`);
    }
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
    logger?: (log: {
      method: string;
      endpoint: string;
      request: { body?: unknown; headers?: Record<string, string> };
      response: { body?: unknown; status: number; headers?: Record<string, string> };
      duration: number;
      error?: string;
    }) => void
  ): Promise<NextActionResponse> {
    const body: AgentInteractRequest = {
      url,
      query,
      dom: dom.substring(0, 50000), // Truncate large DOM for logging
      taskId: taskId || undefined,
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
}

export const apiClient = new ApiClient();
export type { 
  ResolveKnowledgeResponse, 
  KnowledgeChunk, 
  Citation, 
  NextActionResponse, 
  AgentInteractRequest,
  PreferencesResponse,
  PreferencesRequest
};
