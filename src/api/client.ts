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
 * Response from POST /api/agent/interact
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
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
}

// Get API base URL from environment or use default
// This will be injected at build time via webpack
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'https://api.example.com').replace(/\/$/, '');

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
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown
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

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit', // Chrome extension doesn't use cookies
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        throw error;
      }
      // Network errors
      throw new Error(`Network error: ${error instanceof Error ? error.message : String(error)}`);
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
   * Reference: THIN_CLIENT_ROADMAP.md §3.1 (Task 2: Runtime Knowledge Resolution)
   * Reference: SERVER_SIDE_AGENT_ARCH.md §5 (GET /api/knowledge/resolve)
   */
  async knowledgeResolve(url: string, query?: string): Promise<ResolveKnowledgeResponse> {
    const params = new URLSearchParams({ url });
    if (query) {
      params.append('query', query);
    }
    
    return this.request<ResolveKnowledgeResponse>(
      'GET',
      `/api/knowledge/resolve?${params.toString()}`
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
    taskId?: string | null
  ): Promise<NextActionResponse> {
    const body: AgentInteractRequest = {
      url,
      query,
      dom,
      taskId: taskId || undefined,
    };

    return this.request<NextActionResponse>('POST', '/api/agent/interact', body);
  }
}

export const apiClient = new ApiClient();
export type { ResolveKnowledgeResponse, KnowledgeChunk, Citation, NextActionResponse, AgentInteractRequest };
