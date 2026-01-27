# Backend Changes: Web Search and User-Friendly Messages

**Document Version:** 1.0  
**Date:** January 27, 2026  
**Status:** Implementation Plan  
**Source:** User requirements for web search before task implementation and user-friendly message generation

**Sync:** This document outlines the backend changes needed to:
1. Implement web search before task implementation (agent searches web to understand how to complete tasks)
2. Generate user-friendly messages directly from the LLM (instead of frontend transformation)
3. Implement chat persistence with Session and Message schemas for long-term memory
4. Fix "lying agent" problem with proper error handling and anti-hallucination measures

**Reference Architecture:**
- `SERVER_SIDE_AGENT_ARCH.md` §4.2 (POST /api/agent/interact) — Current agent interaction flow
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §4.2 (Execution Flow) — Orchestrator flow
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §5.4 (Planning Engine) — Planning engine

Keep all documents in sync; on conflict, prefer this roadmap for implementation details.

---

## 1. Overview

This document is the **server-side** implementation roadmap for:
1. **Web Search Integration** (Task 1): Agent performs web search before task implementation to understand how to complete tasks
2. **User-Friendly Message Generation** (Task 2): LLM generates user-friendly messages directly instead of technical developer-centric language
3. **Chat Persistence & Session Management** (Task 3): Persistent conversation threads with Session and Message schemas for long-term memory
4. **Error Handling & Anti-Hallucination** (Task 4): Proper error propagation and validation to prevent premature task completion

Each task covers **persistence (Mongoose schemas where needed)**, **API endpoint enhancements**, and **prompt engineering** only. We use **MongoDB** with **Prisma (Better Auth)** and **Mongoose (app)**; there are **no SQL migrations**.

### 1.1 Principles

- **Vertical slices:** Each task delivers complete functionality (DB + API + prompts). No standalone "schema-only" or "API scaffolding-only" phases.
- **Sequential tasks:** Tasks 1-2 can be implemented independently or in parallel. Task 3 (Chat Persistence) should be implemented before Task 4 (Error Handling) as Task 4 depends on the Session/Message structure. All tasks enhance the existing `POST /api/agent/interact` endpoint.
- **Tenant + domain isolation:** All DB and RAG access scoped by **Tenant ID** (from session) and **Active Domain** (from request URL) when org-specific. Follows existing patterns in `THIN_SERVER_ROADMAP.md` §1.1.

### 1.2 Prerequisites

- Next.js application (App Router) with deployment target (e.g. Vercel, Node server).
- **MongoDB** (Atlas recommended). **No PostgreSQL, no Drizzle.** See `THIN_SERVER_ROADMAP.md` §1.4 for DB stack.
- CORS configured to allow extension origin (`chrome-extension://<id>`) for `/api/auth/*`, `/api/v1/*`, `/api/agent/*`, `/api/knowledge/*`.
- Existing `POST /api/agent/interact` endpoint implemented (see `THIN_SERVER_ROADMAP.md` §4, `SERVER_SIDE_AGENT_ARCH.md` §4).
- LLM integration with OpenAI (or configured alternative) via `lib/agent/llm-client.ts`.

### 1.3 Database Stack (MongoDB, Prisma, Mongoose)

**Reference:** `THIN_SERVER_ROADMAP.md` §1.4 (Database Stack)

- **Prisma (Better Auth)** — Used **only** for auth: `User`, `Session`, `Account`, `Organization`, `Member`, `Invitation`, `Verification`. We **reuse** these; we **do not** add new auth tables.
- **Mongoose (Application data)** — Used for all app data. New schemas (web search results, etc.) added as **Mongoose schemas** in `lib/models/`, not as Prisma models.

**Tenant:** In normal mode, tenant = **user** (`userId`). In organization mode, tenant = **organization** (`organizationId`). No separate `tenants` table. See `THIN_SERVER_ROADMAP.md` §1.4.

---

## Task 1: Web Search Before Task Implementation

**Objective:** Implement web search functionality that runs before task planning. The agent should search the web to understand how to complete the task, then use search results to inform planning and execution.

**Deliverable:** Web search integration that:
- Performs web search for new tasks (when `taskId` is null/undefined)
- Stores search results in task context
- Integrates search results into planning prompts
- Handles search failures gracefully (continues without search)

**Reference:**
- `SERVER_SIDE_AGENT_ARCH.md` §4.2 (POST /api/agent/interact) — Current agent interaction flow
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §4.2 (Execution Flow) — Orchestrator flow to be enhanced

---

### 1.1 Updated Orchestrator Flow

**Location:** `POST /api/agent/interact` handler (or orchestrator middleware)

**Change:** Modify the execution flow to include a web search step **before** planning when it's a new task.

**Updated Flow:**
```
Request N arrives with new DOM
  ↓
1. Is this a new task? (taskId is null/undefined)
   ├─ Yes → Perform web search to understand how to complete the task
   │   └─ Store search results in task context
   └─ No → Skip search (use existing plan/context)
  ↓
2. VERIFY: Did previous action (N-1) achieve expected outcome?
   ├─ Yes → Proceed to step 3
   └─ No → Trigger Self-Correction → Retry or return corrected action
  ↓
3. PLAN: Does task have a plan?
   ├─ No → Generate plan (using search results if available) → Store in task.plan
   └─ Yes → Use existing plan
  ↓
4. EXECUTE: Get next step from plan
   ├─ No more steps → Return finish()
   └─ Has step → Refine to tool action
  ↓
5. PREDICT: What should happen after this action?
   └─ Generate expectedOutcome
  ↓
6. RESPONSE: Return action + expectedOutcome to client
   └─ Client executes → Returns new DOM in Request N+1
```

**Why This Flow:**
Web search provides context about how to complete the task before planning begins. This enables more accurate planning and better task execution. Search only happens once per task (on first request) to avoid redundant API calls.

---

### 1.2 Persistence for Task 1

**Enhancement to Existing Mongoose Model: `tasks`**

**Location:** `lib/models/task.ts`

**Schema Update:**
```typescript
// Add to existing Task schema
export interface Task {
  // ... existing fields (taskId, tenantId, status, etc.)
  
  // New optional field for web search results
  webSearchResult?: {
    searchQuery: string; // The query used for search
    results: Array<{
      title: string;
      url: string;
      snippet: string; // Brief summary from search result
      relevanceScore?: number; // Optional relevance score (0-1)
    }>;
    summary: string; // LLM-generated summary of search results
    timestamp: Date; // When search was performed
  };
}
```

**Storage Strategy:**
- Store search results when task is created (first request without `taskId`)
- Reuse search results for all subsequent requests in the same task
- Don't re-search on every request (search is one-time per task)

**Why This Schema:**
Enables storing web search results in the task for reuse across all requests in the same task. Search results inform planning and execution, so they need to be persisted.

---

### 1.3 Web Search Implementation

**Location:** New file `lib/agent/web-search.ts`

**Function Signature:**
```typescript
/**
 * Performs web search to understand how to complete a task
 * @param query - User's task instructions
 * @param url - Current page URL (for context)
 * @param tenantId - Tenant ID for RAG check (optional, for Option C)
 * @returns Search results with relevant information, or null if search skipped/failed
 */
export async function performWebSearch(
  query: string,
  url: string,
  tenantId?: string
): Promise<WebSearchResult | null> {
  // Implementation details below
}
```

**Web Search Result Type:**
```typescript
export type WebSearchResult = {
  searchQuery: string; // The query used for search
  results: Array<{
    title: string;
    url: string;
    snippet: string; // Brief summary from search result
    relevanceScore?: number; // Optional relevance score (0-1)
  }>;
  summary: string; // LLM-generated summary of search results
  timestamp: Date;
};
```

**Implementation Options:**

**Option A: Use Search API (Recommended)**
- Use a search API like Google Custom Search, Bing Search API, or SerpAPI
- Requires API key configuration
- Example with Google Custom Search:
```typescript
import axios from 'axios';

export async function performWebSearch(
  query: string,
  url: string
): Promise<WebSearchResult | null> {
  try {
    const hostname = new URL(url).hostname;
    const searchQuery = `how to ${query} ${hostname}`;
    
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: process.env.GOOGLE_SEARCH_API_KEY,
        cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
        q: searchQuery,
        num: 5, // Limit to top 5 results
      },
    });

    const results = response.data.items?.map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    })) || [];

    // Generate summary using LLM
    const summary = await generateSearchSummary(query, results);

    return {
      searchQuery,
      results,
      summary,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Web search failed:', error);
    return null; // Return null to indicate search was skipped
  }
}
```

**Option B: Use LLM with Web Browsing Capability**
- If using GPT-4 with browsing or similar model
- Let the LLM search and summarize
- Example:
```typescript
export async function performWebSearch(
  query: string,
  url: string
): Promise<WebSearchResult | null> {
  try {
    const searchPrompt = `Search the web to understand how to complete this task: "${query}" on the website ${url}. 
    Provide a summary of the steps needed and any relevant information.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4', // or model with browsing capability
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that searches the web to understand how to complete tasks.',
        },
        {
          role: 'user',
          content: searchPrompt,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the web for information',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
        },
      ],
    });

    // Extract search results and summary from completion
    // Implementation depends on LLM response format
    // Return WebSearchResult or null
  } catch (error) {
    console.error('Web search failed:', error);
    return null;
  }
}
```

**Option C: Use Existing RAG/Knowledge Base First**
- Check if task can be completed using existing knowledge
- Only search if knowledge is insufficient
- Example:
```typescript
export async function performWebSearch(
  query: string,
  url: string,
  tenantId: string
): Promise<WebSearchResult | null> {
  try {
    // First, check if we have sufficient knowledge
    const ragChunks = await getRAGChunks(url, query, tenantId);
    
    // If we have org-specific knowledge and it's comprehensive, skip search
    if (ragChunks.hasOrgKnowledge && ragChunks.chunks.length >= 3) {
      return null; // Skip web search
    }

    // Otherwise, perform web search (use Option A or B)
    // ... (implementation from Option A or B)
  } catch (error) {
    console.error('Web search failed:', error);
    return null;
  }
}
```

**Why These Options:**
- **Option A:** Most reliable, uses dedicated search APIs. Requires API key setup.
- **Option B:** Uses LLM's built-in browsing if available. May be slower but doesn't require separate API.
- **Option C:** Optimizes for cost/performance by checking RAG first. Only searches when needed.

---

### 1.4 API Endpoint Enhancements (Task 1)

**Enhancement to Existing Endpoint: `POST /api/agent/interact`**

**Location:** `lib/api/agent/interact/route.ts` (or similar, depending on your structure)

**Changes:**

1. **Add web search step for new tasks:**
   ```typescript
   // In the request handler, after task resolution
   if (!taskId) {
     // New task - perform web search
     const webSearchResult = await performWebSearch(query, url, tenantId);
     
     // Create task with search results
     const newTask = await Task.create({
       taskId: crypto.randomUUID(),
       tenantId,
       status: 'active',
       webSearchResult: webSearchResult || undefined,
       // ... other fields
     });
     
     taskId = newTask.taskId;
   } else {
     // Existing task - load search results from task
     const task = await Task.findOne({ taskId, tenantId });
     const webSearchResult = task?.webSearchResult;
   }
   ```

2. **Integrate search results into planning:**
   - Pass `webSearchResult` to planning engine
   - Planning engine includes search results in prompt (see Section 1.5)

3. **Update response (optional):**
   ```typescript
   export interface NextActionResponse {
     thought: string;
     action: string;
     usage?: {
       promptTokens: number;
       completionTokens: number;
     };
     taskId?: string;
     // ... existing fields
     
     // New optional fields
     webSearchPerformed?: boolean; // Indicates if web search was performed for this task
     webSearchSummary?: string; // Brief summary of search results (for UI display)
   }
   ```

**Why These Enhancements:**
Enables web search for new tasks and integrates search results into the planning process. Optional response fields allow client to display search status in UI.

---

### 1.5 Planning Engine Integration

**Location:** Planning Engine (`lib/agent/planning-engine.ts` or similar)

**Change:** Include search results in the planning prompt

**Updated Planning Prompt:**
```typescript
export function buildPlanningPrompt(
  query: string,
  url: string,
  dom: string,
  webSearchResult?: WebSearchResult,
  ragChunks?: RAGChunk[]
): string {
  let prompt = `You are an AI assistant that creates action plans for browser automation tasks.

User Task: ${query}
Current URL: ${url}

`;

  // Add web search results if available
  if (webSearchResult) {
    prompt += `\n## Web Search Results
I searched the web to understand how to complete this task. Here's what I found:

Search Query: ${webSearchResult.searchQuery}

Summary: ${webSearchResult.summary}

Top Results:
${webSearchResult.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`).join('\n')}

Use this information to create a more accurate plan.
`;
  }

  // Add RAG chunks if available
  if (ragChunks && ragChunks.length > 0) {
    prompt += `\n## Organization Knowledge\n${ragChunks.map(c => c.content).join('\n\n')}\n`;
  }

  // Add DOM
  prompt += `\n## Current Page Structure\n${dom}\n`;

  prompt += `\nCreate a step-by-step plan to complete the task. Each step should be clear and actionable.`;

  return prompt;
}
```

**Why This Integration:**
Search results provide external knowledge about how to complete the task, enabling more accurate planning. The planning engine uses this context to create better action plans.

---

### 1.6 Environment Variables

**Location:** `.env.local` or environment configuration

**Add:**
```bash
# Web Search API Configuration
GOOGLE_SEARCH_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_engine_id_here

# OR for other search providers
BING_SEARCH_API_KEY=your_api_key_here
SERPAPI_KEY=your_api_key_here
```

**Why These Variables:**
Required for Option A (Search API) implementation. Configure based on chosen search provider.

---

### 1.7 Error Handling

**Location:** Web search function and orchestrator

**Handle:**
- Search API failures (fallback to planning without search)
- Rate limiting (cache results, skip if recent search for similar query)
- Invalid responses (log error, continue without search)

**Strategy:**
- Web search should be **optional** - task should work even if search fails
- Return `null` from `performWebSearch()` on failure
- Continue with planning/execution without search results if search fails
- Log errors for debugging but don't throw

**Why This Strategy:**
Ensures task execution continues even if web search fails. Search is an enhancement, not a requirement.

---

### 1.8 Definition of Done / QA Verification (Task 1)

- [ ] Web search function implemented (`lib/agent/web-search.ts`)
- [ ] Task schema updated to include `webSearchResult` field
- [ ] Orchestrator flow updated to call web search for new tasks
- [ ] Search results stored in task when task is created
- [ ] Planning engine updated to include search results in prompt
- [ ] Environment variables configured for search API (if using Option A)
- [ ] Error handling implemented (search failures don't break task execution)
- [ ] Response type updated to include search status (optional)
- [ ] CORS configured for extension origin
- [ ] Tenant isolation verified (search results scoped by tenant)

**Exit criterion:** Task 1 complete when web search is integrated into the orchestrator flow and search results inform planning. Proceed to Task 2 (can be done in parallel).

---

## Task 2: User-Friendly Message Generation

**Objective:** Update LLM prompts to generate user-friendly messages directly instead of developer-centric technical language. The LLM should write `<Thought>` responses for end users, not developers.

**Deliverable:** Updated system prompts and prompt builders that instruct the LLM to:
- Use plain, conversational language
- Avoid technical jargon (DOM, element IDs, verification, etc.)
- Explain actions in terms of what the user sees and understands
- Generate user-friendly error and retry messages

**Reference:**
- `SERVER_SIDE_AGENT_ARCH.md` §4.6 (LLM Integration) — Current LLM prompt structure
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §5.4 (Planning Engine) — Planning prompts

---

### 2.1 System Prompt Update

**Location:** System prompt in `lib/agent/prompt-builder.ts` (or similar)

**Change:** Update the system prompt to include explicit instructions for user-friendly language.

**Updated System Prompt:**
```typescript
export function buildSystemPrompt(): string {
  return `You are an AI assistant that helps users complete tasks on web pages through browser automation.

## Communication Style

**CRITICAL: Always use user-friendly, non-technical language in your <Thought> responses.**

Your <Thought> messages will be displayed directly to end users. They should:
- Use plain, conversational language
- Avoid technical jargon (DOM, element IDs, verification, etc.)
- Explain actions in terms of what the user sees and understands
- Be clear about what you're doing and why

### Language Guidelines

**❌ AVOID (Developer-centric):**
- "DOM structure"
- "element ID 123"
- "verification failed"
- "Previous action failed verification"
- "Retrying with corrected approach"
- "accessibility tree"
- "simplified DOM"
- "extracting DOM"
- "Given the DOM structure, element ID '68' seems to be the right starting point"

**✅ USE INSTEAD (User-friendly):**
- "page structure" or "the page"
- "the button" or "the element" (avoid mentioning IDs)
- "the action did not work as expected"
- "The previous action didn't work, so I'm trying a different approach"
- "Trying a different approach"
- "page elements" or "clickable elements"
- "analyzing the page"
- "Based on the page, I'll click on the 'Patient' button to get started"

### Examples

**Bad (Technical):**
\`\`\`
<Thought>To register a new patient named 'Jaswanth' in an OpenEMR system, the first step is to navigate to the patient registration section. Given the DOM structure, the 'Patient' button with id='68' seems to be the right starting point. I will click on element ID 68 to navigate to the patient management area.</Thought>
\`\`\`

**Good (User-friendly):**
\`\`\`
<Thought>I'll help you register a new patient named 'Jaswanth'. First, I need to go to the patient registration section. I can see a 'Patient' button on the page, so I'll click on that to get started.</Thought>
\`\`\`

**Bad (Technical):**
\`\`\`
<Thought>Previous action failed verification. Since the original element ID '68' is not valid for navigating to the patient management area, I will try using a different element. In this case, ID '79' corresponds to 'Visits,' which may lead to the intended area. Retrying with corrected approach.</Thought>
\`\`\`

**Good (User-friendly):**
\`\`\`
<Thought>The previous action didn't work as expected. I'll try clicking on the 'Visits' button instead, which should help us get to the patient management area.</Thought>
\`\`\`

**Bad (Technical):**
\`\`\`
<Thought>Step 2 verification: Success (85% confidence). The expected outcome was achieved. Proceeding to step 3.</Thought>
\`\`\`

**Good (User-friendly):**
\`\`\`
<Thought>Great! That worked. The form is now open. Let me continue by filling in the patient's name.</Thought>
\`\`\`

### Action Descriptions

When describing actions, focus on what the user would see:
- Instead of: "clicking element #123"
- Use: "clicking on the 'Submit' button"

- Instead of: "setValue(456, 'John Doe')"
- Use: "entering 'John Doe' into the name field"

- Instead of: "navigating to patient registration section"
- Use: "going to the patient registration page"

## Available Actions

[Include your existing action definitions here]

## Response Format

You must respond with exactly this format:
<Thought>Your user-friendly explanation of what you're doing and why</Thought>
<Action>actionName(arg1, arg2, ...)</Action>

Remember: The <Thought> is for the end user, not for developers. Write it as if you're explaining to someone who has no technical knowledge of how web pages work.
`;
}
```

**Why This Update:**
Instructs the LLM to generate user-friendly messages from the start, eliminating the need for frontend transformation. All `<Thought>` responses will be written for end users.

---

### 2.2 Prompt Builder Update

**Location:** `lib/agent/prompt-builder.ts` (or similar)

**Change:** Update the user message prompt to reinforce user-friendly language.

**Updated Action Prompt:**
```typescript
export function buildActionPrompt(
  query: string,
  url: string,
  dom: string,
  previousActions: Array<{ thought: string; action: string }>,
  webSearchResult?: WebSearchResult,
  ragChunks?: RAGChunk[]
): string {
  let prompt = `User Task: ${query}
Current URL: ${url}
Current Time: ${new Date().toISOString()}

`;

  // Add web search results if available
  if (webSearchResult) {
    prompt += `\n## Context from Web Search
I searched the web to understand how to complete this task. Here's what I found:

${webSearchResult.summary}

Use this information to guide your actions and explain them in user-friendly terms.
`;
  }

  // Add RAG chunks if available
  if (ragChunks && ragChunks.length > 0) {
    prompt += `\n## Relevant Information\n${ragChunks.map(c => c.content).join('\n\n')}\n`;
  }

  // Add previous actions (in user-friendly format)
  if (previousActions.length > 0) {
    prompt += `\n## What I've Done So Far\n`;
    previousActions.forEach((action, index) => {
      prompt += `Step ${index + 1}: ${action.thought}\n`;
    });
    prompt += `\n`;
  }

  // Add DOM (but don't mention it's "DOM" - just call it "page structure")
  prompt += `\n## Current Page Structure\n${dom}\n`;

  prompt += `\n## Instructions
1. Analyze the page structure and user task
2. Decide on the next action to take
3. Write a user-friendly <Thought> explaining what you're doing and why
4. Provide the <Action> in the correct format

Remember: Write your <Thought> as if explaining to a non-technical user. Avoid mentioning technical details like element IDs, DOM structure, or verification processes.`;
  
  return prompt;
}
```

**Why This Update:**
Reinforces user-friendly language in the user message prompt, ensuring the LLM generates appropriate messages even with technical context (DOM, search results, etc.).

---

### 2.3 Verification and Correction Prompts

**Location:** Verification and correction prompt builders (if using Manus orchestrator)

**Change:** Update verification and correction prompts to generate user-friendly messages.

**Updated Verification Prompt:**
```typescript
export function buildVerificationPrompt(
  expectedOutcome: string,
  actualState: string
): string {
  return `Verify if the action achieved its expected outcome.

Expected: ${expectedOutcome}
Actual: ${actualState}

Provide a user-friendly explanation of whether the action worked. If it didn't work, explain why in simple terms that an end user would understand.

Avoid technical terms like "verification failed" or "element not found". Instead, say things like "the button didn't appear" or "the form didn't open as expected".`;
}
```

**Updated Correction Prompt:**
```typescript
export function buildCorrectionPrompt(
  failedStep: string,
  reason: string
): string {
  return `The previous step didn't work: ${reason}

Original step: ${failedStep}

Suggest a user-friendly explanation for what went wrong and what you'll try instead. Avoid technical details. Focus on what the user would observe.

Example good response:
"The form didn't open when I clicked that button. Let me try clicking on the 'New Patient' link in the menu instead."

Example bad response:
"Element ID 68 verification failed. Retrying with alternative selector strategy using element ID 79."`;
}
```

**Why These Updates:**
Ensures verification and correction messages are also user-friendly, maintaining consistency across all LLM-generated messages.

---

### 2.4 Definition of Done / QA Verification (Task 2)

- [ ] System prompt updated with user-friendly language instructions
- [ ] Action prompt builder updated to reinforce user-friendly language
- [ ] Verification prompt updated (if using Manus orchestrator)
- [ ] Correction prompt updated (if using Manus orchestrator)
- [ ] All prompts tested to ensure no technical jargon in responses
- [ ] Thought messages verified to be user-friendly
- [ ] Error messages verified to be user-friendly
- [ ] Retry messages verified to be user-friendly

**Exit criterion:** Task 2 complete when all LLM prompts generate user-friendly messages and no technical jargon appears in `<Thought>` responses.

---

## Task 3: Chat Persistence & Session Management

**Objective:** Implement persistent conversation threads using Session and Message schemas. This enables long-term memory, chat history persistence, and proper state management across client reloads.

**Deliverable:** Database schemas and API endpoints that:
- Store conversation threads in `Session` collection
- Store individual messages in `Message` collection
- Load conversation history from database (not client-provided history)
- Enable chat persistence across client reloads
- Support fetching latest session and messages

**Reference:**
- `SERVER_SIDE_AGENT_ARCH.md` §4.3 (Action History) — Current history handling
- `THIN_SERVER_ROADMAP.md` §4.1 (Task Schema) — Existing task structure

---

### 3.1 Persistence for Task 3

**New Mongoose Model: `sessions`**

**Location:** `lib/models/session.ts`

**Purpose:** Groups a conversation thread. Represents a single user task/session that may span multiple requests.

**Fields:**
- `sessionId` (string, indexed, unique) — UUID for the session
- `userId` (string, indexed) — User who owns the session
- `tenantId` (string, indexed) — Tenant isolation
- `url` (string) — Initial URL where the task started
- `status` (string, enum) — `'active'` | `'completed'` | `'failed'` | `'interrupted'`
- `createdAt` (Date, indexed) — When session was created
- `updatedAt` (Date) — Last update timestamp
- `metadata` (object, optional) — Additional session metadata (e.g., task type, initial query)

**Indexes:**
- `{ sessionId: 1 }` — Unique index for session lookup
- `{ userId, createdAt: -1 }` — For user's session history
- `{ tenantId, status, createdAt: -1 }` — For tenant-scoped queries

**Why This Schema:**
Enables grouping messages into conversation threads. Provides session-level state management and allows users to resume conversations after client reloads.

---

**New Mongoose Model: `messages`**

**Location:** `lib/models/message.ts`

**Purpose:** Stores individual messages in a conversation thread. Represents both user instructions and assistant responses.

**Fields:**
- `messageId` (string, indexed, unique) — UUID for the message
- `sessionId` (string, indexed, ref: Session) — Links to parent session
- `userId` (string, indexed) — User who owns the message (for security)
- `tenantId` (string, indexed) — Tenant isolation
- `role` (string, enum) — `'user'` | `'assistant'` | `'system'`
- `content` (string) — The main text/thought (user instruction or assistant thought)
- `actionPayload` (object, optional) — Structured action data (e.g., `{ type: 'click', target: 123, elementId: 123 }`)
- `actionString` (string, optional) — Action string (e.g., `"click(123)"`)
- `status` (string, enum) — `'success'` | `'failure'` | `'pending'` — Action execution status
- `error` (object, optional) — Error details if action failed (e.g., `{ message: "Element not found", code: "ELEMENT_NOT_FOUND" }`)
- `sequenceNumber` (number, indexed) — Message order within session (0-indexed)
- `timestamp` (Date, indexed) — When message was created
- `metadata` (object, optional) — Debug info: `{ tokens_used, latency, llm_model, verification_result }`

**Indexes:**
- `{ messageId: 1 }` — Unique index for message lookup
- `{ sessionId, sequenceNumber: 1 }` — For ordered message retrieval
- `{ userId, timestamp: -1 }` — For user's message history
- `{ tenantId, sessionId, sequenceNumber: 1 }` — For tenant-scoped ordered queries

**Why This Schema:**
Enables storing the linear conversation history. Allows the backend to load true history from database instead of trusting client-provided history. Supports error tracking and debug metadata.

---

### 3.2 API Endpoint Enhancements (Task 3)

**Enhancement to Existing Endpoint: `POST /api/agent/interact`**

**Location:** `lib/api/agent/interact/route.ts` (or similar)

**Changes:**

1. **Session Resolution:**
   ```typescript
   // In request handler
   const { sessionId, url, query, dom, taskId, lastActionStatus } = request.body;
   
   // Resolve or create session
   let session;
   if (sessionId) {
     // Load existing session
     session = await Session.findOne({ sessionId, tenantId });
     if (!session) {
       return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
     }
     // Security check: ensure user owns session
     if (session.userId !== userId) {
       return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
     }
   } else {
     // Create new session
     session = await Session.create({
       sessionId: crypto.randomUUID(),
       userId,
       tenantId,
       url,
       status: 'active',
       createdAt: new Date(),
       metadata: { initialQuery: query },
     });
   }
   ```

2. **Load History from Database:**
   ```typescript
   // Instead of using client-provided history, load from DB
   const previousMessages = await Message.find({
     sessionId: session.sessionId,
     tenantId,
   })
     .sort({ sequenceNumber: 1 })
     .limit(50); // Last 50 messages for context
   
   // Convert to format expected by prompt builder
   const actionHistory = previousMessages
     .filter(m => m.role === 'assistant' && m.actionString)
     .map(m => ({
       thought: m.content,
       action: m.actionString,
       status: m.status,
     }));
   ```

3. **Save Message Before Responding:**
   ```typescript
   // After generating LLM response, save assistant message
   const assistantMessage = await Message.create({
     messageId: crypto.randomUUID(),
     sessionId: session.sessionId,
     userId,
     tenantId,
     role: 'assistant',
     content: response.thought,
     actionPayload: parseAction(response.action), // Structured action
     actionString: response.action,
     status: 'pending', // Will be updated by client after execution
     sequenceNumber: previousMessages.length,
     timestamp: new Date(),
     metadata: {
       tokens_used: response.usage,
       llm_model: model,
     },
   });
   
   // Also save user message if this is a new turn
   if (query && previousMessages.length === 0) {
     await Message.create({
       messageId: crypto.randomUUID(),
       sessionId: session.sessionId,
       userId,
       tenantId,
       role: 'user',
       content: query,
       sequenceNumber: 0,
       timestamp: new Date(),
     });
   }
   ```

4. **Update Response:**
   ```typescript
   // Include sessionId in response
   return new Response(JSON.stringify({
     thought: response.thought,
     action: response.action,
     usage: response.usage,
     taskId: session.sessionId, // Use sessionId as taskId for backward compatibility
     sessionId: session.sessionId, // New field
   }), { status: 200 });
   ```

**Why These Enhancements:**
Enables the backend to own the conversation history, preventing client-side manipulation. Ensures persistence across client reloads and provides a single source of truth for conversation state.

---

**New Endpoint: `GET /api/session/:sessionId/messages`**

**Location:** `lib/api/session/[sessionId]/messages/route.ts`

**Purpose:** Retrieve conversation history for a session. Used by client to hydrate chat view on reload.

**Auth:** Bearer token

**Query params:**
- `limit` (optional, default: 50) — Max messages to return
- `since` (optional) — Timestamp to filter messages after

**Response:**
```typescript
{
  sessionId: string;
  messages: Array<{
    messageId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    actionPayload?: object;
    actionString?: string;
    status?: 'success' | 'failure' | 'pending';
    error?: object;
    timestamp: Date;
    metadata?: object;
  }>;
  total: number;
}
```

**Tenant isolation:** Only returns messages for sessions owned by authenticated user/tenant.

**Why This Endpoint:**
Enables client to fetch conversation history on mount, restoring chat view after reload. Provides API access to conversation threads.

---

**New Endpoint: `GET /api/session/latest`**

**Location:** `lib/api/session/latest/route.ts`

**Purpose:** Get the most recent active session for the user. Used by client to resume conversation.

**Auth:** Bearer token

**Query params:**
- `status` (optional) — Filter by session status (default: 'active')

**Response:**
```typescript
{
  sessionId: string;
  url: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}
```

**Why This Endpoint:**
Enables client to quickly find and resume the latest conversation without needing to know the sessionId.

---

### 3.3 Definition of Done / QA Verification (Task 3)

- [ ] Mongoose model `Session` created with proper indexes
- [ ] Mongoose model `Message` created with proper indexes
- [ ] `POST /api/agent/interact` updated to create/load sessions
- [ ] `POST /api/agent/interact` loads history from database (not client)
- [ ] `POST /api/agent/interact` saves messages before responding
- [ ] `GET /api/session/:sessionId/messages` endpoint implemented
- [ ] `GET /api/session/latest` endpoint implemented
- [ ] Tenant isolation verified (no cross-tenant session/message access)
- [ ] Security checks verified (users can only access their own sessions)
- [ ] CORS configured for extension origin
- [ ] Message sequence numbers maintained correctly
- [ ] Session status updated on task completion/failure

**Exit criterion:** Task 3 complete when conversation threads are persisted in database and can be retrieved via API. Client can reload and restore chat history. Proceed to Task 4.

---

## Task 4: Error Handling & Anti-Hallucination

**Objective:** Implement proper error propagation and validation to prevent the "lying agent" problem (premature task completion). The backend must detect client-reported failures and force the LLM to acknowledge errors instead of hallucinating success.

**Deliverable:** Error handling system that:
- Detects client-reported action failures in request payload
- Injects failure context into LLM prompts as system messages
- Validates `finish()` actions before allowing completion
- Prevents LLM from ignoring errors and calling `finish()` prematurely

**Reference:**
- `SERVER_SIDE_AGENT_ARCH.md` §4.6 (LLM Integration) — Current LLM prompt structure
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §5.3 (Self-Correction Engine) — Correction logic

---

### 4.1 Request Body Enhancement

**Location:** Request schema for `POST /api/agent/interact`

**Change:** Add fields to request body to report action execution status.

**Updated Request Schema:**
```typescript
interface AgentInteractRequest {
  sessionId?: string; // Session ID (replaces taskId for new structure)
  taskId?: string; // Legacy support (maps to sessionId)
  url: string;
  query: string;
  dom: string;
  
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
}
```

**Why This Enhancement:**
Enables client to report action failures explicitly. Backend can detect failures and inject them into LLM context, preventing the LLM from ignoring errors.

---

### 4.2 API Logic Updates (Task 4)

**Enhancement to Existing Endpoint: `POST /api/agent/interact`**

**Location:** `lib/api/agent/interact/route.ts` (or similar)

**Changes:**

1. **Detect Client Failure Payload:**
   ```typescript
   // In request handler, after loading session
   const { lastActionStatus, lastActionError, lastActionResult } = request.body;
   
   // Check if previous action failed
   const previousActionFailed = lastActionStatus === 'failure' || 
                                 (lastActionResult && !lastActionResult.success);
   
   if (previousActionFailed) {
     // Update last message status to failure
     const lastMessage = await Message.findOne({
       sessionId: session.sessionId,
       tenantId,
     }).sort({ sequenceNumber: -1 });
     
     if (lastMessage && lastMessage.role === 'assistant') {
       lastMessage.status = 'failure';
       lastMessage.error = lastActionError || {
         message: lastActionResult?.actualState || 'Action failed',
         code: 'ACTION_FAILED',
       };
       await lastMessage.save();
     }
   }
   ```

2. **Inject Failure Context into LLM Prompt:**
   ```typescript
   // In prompt builder call
   const systemMessages: string[] = [];
   
   if (previousActionFailed) {
     const errorContext = lastActionError || {
       message: 'The previous action did not work as expected',
       code: 'UNKNOWN_ERROR',
       action: 'unknown',
     };
     
     systemMessages.push(
       `[SYSTEM ERROR]: The previous action '${errorContext.action}' FAILED. ` +
       `Error: ${errorContext.message} (Code: ${errorContext.code}). ` +
       `You MUST acknowledge this failure in your <Thought> and try a different strategy. ` +
       `Do NOT try the same action again. Do NOT call finish() until you have successfully completed the task. ` +
       `If the error indicates an element was not found, try searching for text, using different selectors, or scrolling to make the element visible.`
     );
   }
   
   // Pass systemMessages to prompt builder
   const prompt = buildActionPrompt(
     query,
     url,
     dom,
     actionHistory,
     webSearchResult,
     ragChunks,
     systemMessages // New parameter
   );
   ```

3. **Validate `finish()` Actions:**
   ```typescript
   // After LLM response, before saving message
   const parsedAction = parseAction(response.action);
   
   if (parsedAction.name === 'finish') {
     // Check if there are recent failures
     const recentFailures = await Message.find({
       sessionId: session.sessionId,
       tenantId,
       status: 'failure',
       timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
     });
     
     if (recentFailures.length > 0) {
       // Override finish() with verification step
       // Force LLM to verify task completion
       const verificationPrompt = buildVerificationPrompt(
         query,
         actionHistory,
         recentFailures
       );
       
       // Call LLM again for verification
       const verificationResponse = await callActionLLM(verificationPrompt);
       
       if (verificationResponse.action !== 'finish()') {
         // LLM decided not to finish - use verification response
         response = verificationResponse;
       }
       // Otherwise, allow finish() if LLM confirms after verification
     }
     
     // Additional check: verify task actually completed
     // This could check if the DOM shows expected completion state
     // For now, we trust the LLM after verification prompt
   }
   ```

**Why These Enhancements:**
Forces the LLM to acknowledge failures by injecting them as system messages. Prevents premature `finish()` calls by validating completion and checking for recent failures.

---

### 4.3 Prompt Engineering Updates (Task 4)

**Location:** `lib/agent/prompt-builder.ts`

**Change:** Update system prompt and action prompt to handle failures and prevent hallucination.

**Updated System Prompt:**
```typescript
export function buildSystemPrompt(): string {
  return `You are an AI assistant that helps users complete tasks on web pages through browser automation.

## Failure Handling Rules

**CRITICAL: You must strictly follow these rules when handling failures:**

1. **Acknowledge Failures:** If you receive a system error message indicating a previous action failed, you MUST:
   - Acknowledge the failure in your <Thought>
   - Explain why it might have failed in user-friendly terms
   - Propose a different strategy (e.g., "The button wasn't found. Let me try searching for the text instead.")
   - NEVER try the exact same action again
   - NEVER call finish() immediately after a failure

2. **Verification Before Completion:** Before calling finish(), you MUST verify:
   - The task has actually been completed (check the page state)
   - No recent actions have failed
   - The user's goal has been achieved

3. **Forbidden Patterns:**
   - ❌ Calling finish() right after an error report
   - ❌ Ignoring system error messages
   - ❌ Retrying the same failed action without modification
   - ❌ Assuming success without verification

4. **Required Patterns:**
   - ✅ Acknowledge failures explicitly
   - ✅ Try alternative strategies (different selectors, text search, scrolling)
   - ✅ Verify completion before calling finish()
   - ✅ Explain corrections in user-friendly terms

[Include existing user-friendly language guidelines from Task 2]

## Available Actions

[Include your existing action definitions here]

## Response Format

You must respond with exactly this format:
<Thought>Your user-friendly explanation, acknowledging any failures and explaining your next strategy</Thought>
<Action>actionName(arg1, arg2, ...)</Action>
`;
}
```

**Updated Action Prompt Builder:**
```typescript
export function buildActionPrompt(
  query: string,
  url: string,
  dom: string,
  previousActions: Array<{ thought: string; action: string; status?: string }>,
  webSearchResult?: WebSearchResult,
  ragChunks?: RAGChunk[],
  systemMessages?: string[] // New parameter
): string {
  let prompt = `User Task: ${query}
Current URL: ${url}
Current Time: ${new Date().toISOString()}

`;

  // Add system messages (error context) if any
  if (systemMessages && systemMessages.length > 0) {
    prompt += `\n## System Messages\n${systemMessages.join('\n\n')}\n`;
  }

  // Add web search results if available
  if (webSearchResult) {
    prompt += `\n## Context from Web Search\n${webSearchResult.summary}\n`;
  }

  // Add RAG chunks if available
  if (ragChunks && ragChunks.length > 0) {
    prompt += `\n## Relevant Information\n${ragChunks.map(c => c.content).join('\n\n')}\n`;
  }

  // Add previous actions (highlight failures)
  if (previousActions.length > 0) {
    prompt += `\n## What I've Done So Far\n`;
    previousActions.forEach((action, index) => {
      const status = action.status === 'failure' ? ' ❌ FAILED' : 
                     action.status === 'success' ? ' ✅' : '';
      prompt += `Step ${index + 1}: ${action.thought}${status}\n`;
    });
    prompt += `\n`;
  }

  // Add DOM
  prompt += `\n## Current Page Structure\n${dom}\n`;

  prompt += `\n## Instructions
1. Analyze the page structure and user task
2. If there are system error messages, acknowledge them and propose a different strategy
3. Decide on the next action to take (avoid repeating failed actions)
4. Write a user-friendly <Thought> explaining what you're doing and why
5. Provide the <Action> in the correct format
6. Only call finish() if you are certain the task is complete and no recent actions have failed

Remember: Write your <Thought> as if explaining to a non-technical user. Acknowledge failures explicitly and explain your correction strategy.`;
  
  return prompt;
}
```

**New Verification Prompt Builder:**
```typescript
export function buildVerificationPrompt(
  query: string,
  actionHistory: Array<{ thought: string; action: string; status?: string }>,
  recentFailures: Array<{ content: string; error: object }>
): string {
  return `Verify if the task has been completed successfully.

User Task: ${query}

Recent Actions:
${actionHistory.slice(-5).map((a, i) => `${i + 1}. ${a.thought} (${a.action}) ${a.status === 'failure' ? '❌ FAILED' : ''}`).join('\n')}

Recent Failures:
${recentFailures.map(f => `- ${f.content}: ${f.error.message}`).join('\n')}

Question: Has the user's task been successfully completed?

Consider:
- Have all the required steps been completed?
- Have any recent actions failed?
- Does the current page state indicate task completion?
- Are there any error indicators on the page?

If the task is NOT complete or there are recent failures, you MUST NOT call finish(). Instead, propose a correction strategy.

Respond with:
<Thought>Your verification reasoning</Thought>
<Action>finish()</Action> OR <Action>correctiveAction(...)</Action>`;
}
```

**Why These Updates:**
Instructs the LLM to acknowledge failures, avoid repeating failed actions, and verify completion before calling `finish()`. System messages force error awareness, and verification prompts prevent premature completion.

---

### 4.4 Orchestrator Logic Enhancement

**Location:** Orchestrator middleware or `POST /api/agent/interact` handler

**Change:** Add validation middleware that intercepts `finish()` actions.

**Validation Middleware:**
```typescript
export async function validateFinishAction(
  sessionId: string,
  tenantId: string,
  action: string
): Promise<{ allowed: boolean; reason?: string }> {
  const parsed = parseAction(action);
  
  if (parsed.name !== 'finish') {
    return { allowed: true }; // Not a finish action, allow it
  }
  
  // Check for recent failures
  const recentFailures = await Message.find({
    sessionId,
    tenantId,
    status: 'failure',
    timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
  });
  
  if (recentFailures.length > 0) {
    return {
      allowed: false,
      reason: `Cannot finish: ${recentFailures.length} recent action(s) failed. Must resolve failures first.`,
    };
  }
  
  // Check if task has verification step
  const lastMessages = await Message.find({
    sessionId,
    tenantId,
  })
    .sort({ sequenceNumber: -1 })
    .limit(3);
  
  const hasVerification = lastMessages.some(m => 
    m.content.toLowerCase().includes('verify') || 
    m.content.toLowerCase().includes('check')
  );
  
  if (!hasVerification && lastMessages.length > 2) {
    // Task has multiple steps but no verification - require verification
    return {
      allowed: false,
      reason: 'Cannot finish: Task requires verification step before completion.',
    };
  }
  
  return { allowed: true };
}
```

**Integration:**
```typescript
// In request handler, after LLM response
const validation = await validateFinishAction(
  session.sessionId,
  tenantId,
  response.action
);

if (!validation.allowed) {
  // Override finish() with verification prompt
  const verificationResponse = await callActionLLM(
    buildVerificationPrompt(query, actionHistory, recentFailures)
  );
  
  if (verificationResponse.action !== 'finish()') {
    response = verificationResponse; // Use verification response instead
  }
  // If verification still says finish(), allow it (LLM confirmed after verification)
}
```

**Why This Enhancement:**
Provides an additional safety layer to prevent premature `finish()` calls. Validates completion conditions before allowing task to finish.

---

### 4.5 Definition of Done / QA Verification (Task 4)

- [ ] Request schema updated to include `lastActionStatus` and `lastActionError` fields
- [ ] `POST /api/agent/interact` detects client-reported failures
- [ ] Failure context injected into LLM prompts as system messages
- [ ] System prompt updated with failure handling rules
- [ ] Action prompt builder updated to highlight failures
- [ ] Verification prompt builder implemented
- [ ] `validateFinishAction` middleware implemented
- [ ] `finish()` actions validated before allowing completion
- [ ] Recent failures prevent `finish()` calls
- [ ] LLM acknowledges failures in `<Thought>` responses
- [ ] LLM proposes alternative strategies after failures
- [ ] No premature `finish()` calls after errors
- [ ] Error messages saved to Message collection
- [ ] Tenant isolation maintained

**Exit criterion:** Task 4 complete when error propagation works correctly, LLM acknowledges failures, and premature `finish()` calls are prevented. System handles client-reported errors gracefully.

---

## Testing

### Test 1: Web Search for New Tasks

1. Create a new task (no `taskId`)
2. Verify web search is performed
3. Verify search results are stored in task
4. Verify planning uses search results
5. Verify task execution proceeds normally

### Test 2: Existing Task (No Re-Search)

1. Continue an existing task (with `taskId`)
2. Verify web search is NOT performed again
3. Verify existing search results are used (if available)
4. Verify task execution proceeds normally

### Test 3: Search Failure Handling

1. Simulate search API failure (invalid API key, network error, etc.)
2. Verify task continues without search
3. Verify no errors are thrown
4. Verify planning proceeds without search results

### Test 4: RAG Knowledge Integration (if using Option C)

1. Test task with org-specific knowledge
2. Verify search is skipped if knowledge is sufficient
3. Verify search is performed if knowledge is insufficient

### Test 5: User-Friendly Messages

1. Verify all `<Thought>` responses use plain language
2. Verify no technical terms (DOM, element ID, verification, etc.) appear
3. Verify actions are described in user terms
4. Verify error messages are user-friendly
5. Verify retry messages are user-friendly
6. Verify verification messages are user-friendly (if using Manus orchestrator)

### Test 6: Chat Persistence (Task 3)

1. Create a new session and send messages
2. Verify messages are saved to database
3. Reload client and fetch session via `GET /api/session/latest`
4. Verify chat history is restored correctly
5. Verify message sequence numbers are correct
6. Verify tenant isolation (users can't access other users' sessions)
7. Verify session status updates on completion

### Test 7: Error Handling & Anti-Hallucination (Task 4)

1. Send request with `lastActionStatus: 'failure'` and `lastActionError`
2. Verify failure is saved to last message
3. Verify system error message is injected into LLM prompt
4. Verify LLM acknowledges failure in `<Thought>` response
5. Verify LLM proposes alternative strategy (not same action)
6. Verify LLM does NOT call `finish()` immediately after failure
7. Send `finish()` action after recent failure
8. Verify `validateFinishAction` prevents completion
9. Verify verification prompt is triggered
10. Verify task can only finish after verification confirms completion
11. Test with multiple consecutive failures
12. Verify LLM tries different strategies for each failure

---

## Notes

- **Web search should only happen once per task** (on first request)
- **Search results should be cached in the task** for reuse across all requests
- **Consider rate limits and costs** of search API
- **Search should be optional** - task should work even if search fails
- **Search query should be optimized** to find relevant information (e.g., include website name, task description)
- **User-friendly messages should be generated by the LLM**, not transformed on the frontend
- **All `<Thought>` responses should be written for end users**, not developers
- **Technical details** (element IDs, DOM structure, etc.) should never appear in user-facing messages
- **Tasks 1-2 can be implemented independently** or in parallel
- **Task 3 (Chat Persistence) should be implemented before Task 4** (Error Handling) as Task 4 depends on Session/Message structure
- **Error propagation is critical** - client-reported failures must be injected into LLM context to prevent hallucination
- **Session persistence enables** long-term memory and chat history restoration after client reloads
- **Validation middleware prevents** premature task completion by checking for recent failures and requiring verification
