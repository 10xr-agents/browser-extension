# Domain-Aware Sessions

> **Status:** ✅ **FULLY IMPLEMENTED** (Frontend + Backend)

## Overview

Domain-aware sessions automatically manage chat sessions based on the website domain the user is currently on. When a user navigates to a different domain, the extension will either switch to an existing session for that domain or create a new one.

## Features

### 1. Automatic Session Switching
- When the active tab URL changes to a different domain, the extension automatically:
  - Checks if there's an existing active session for the new domain
  - If yes: switches to that session and loads its messages
  - If no: creates a new session with the domain prefix

### 2. Domain-Prefixed Session Titles
- Session titles follow the format: `{domain}: {task description}`
- Examples:
  - `google.com: Search for flights to NYC`
  - `github.com: Review pull request #123`
  - `localhost: Test login flow`

### 3. Session Rename
- Users can rename sessions via the Chat History drawer
- Domain prefix is automatically preserved when renaming
- Sessions marked as renamed won't auto-update their title

## Frontend Implementation

### New Files
- `src/helpers/domainUtils.ts` - Domain extraction and formatting utilities

### Modified Files
- `src/services/sessionService.ts` - Added domain field, findSessionByDomain, renameSession
- `src/state/sessions.ts` - Added switchToUrlSession, renameSession, initializeDomainAwareSessions
- `src/common/App.tsx` - Added URL change listeners and domain-aware initialization
- `src/common/ChatHistoryDrawer.tsx` - Added rename modal and domain badges

### Session Interface Changes

```typescript
interface Session {
  sessionId: string;
  title: string;
  createdAt: number;
  url: string;
  domain?: string;           // NEW: Root domain (e.g., "google.com")
  updatedAt?: number;
  messageCount?: number;
  status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
  isRenamed?: boolean;       // NEW: Whether user manually renamed the session
}
```

---

## Backend Implementation ✅ COMPLETE

### 1. Session Model Updated ✅
**File:** `lib/models/session.ts`

- Added `domain` field (string, optional, indexed)
- Added `title` field (string, optional)
- Added `isRenamed` field (boolean, default: false)
- Added indexes for domain-based queries

### 2. New Endpoints

#### PATCH `/api/session/[sessionId]` ✅
**File:** `app/api/session/[sessionId]/route.ts`

Rename a session with a custom title.

**Request:**
```json
{
  "title": "new session title"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "sessionId": "uuid",
    "title": "new session title",
    "updatedAt": 1706457600000
  }
}
```

**Behavior:**
- Sets `isRenamed: true` to prevent auto-title updates
- Updates `updatedAt` timestamp

---

#### GET `/api/session/[sessionId]` ✅
**File:** `app/api/session/[sessionId]/route.ts`

Get a single session by ID.

**Response:**
```json
{
  "session": {
    "sessionId": "uuid",
    "title": "google.com: Search for flights",
    "domain": "google.com",
    "status": "active",
    "isRenamed": false,
    "createdAt": 1706457600000,
    "updatedAt": 1706457600000,
    "messageCount": 5
  }
}
```

---

#### GET `/api/session/by-domain/[domain]` ✅
**File:** `app/api/session/by-domain/[domain]/route.ts`

Find most recent active session for a domain.

**Query Parameters:**
- `status`: Filter by session status (default: "active")

**Response:**
```json
{
  "session": {
    "sessionId": "uuid",
    "title": "google.com: Search for flights",
    "domain": "google.com",
    "status": "active",
    "updatedAt": 1706457600000
  }
}
```

**Note:** Returns `{ "session": null }` when no session exists (not 404).

---

### 3. Updated Endpoints

#### GET `/api/session` ✅
**File:** `app/api/session/route.ts`

Now includes `title`, `domain`, and `isRenamed` in response.

#### GET `/api/session/latest` ✅
**File:** `app/api/session/latest/route.ts`

Now includes `title`, `domain`, and `isRenamed` in response.

#### POST `/api/agent/interact` ✅
**File:** `app/api/agent/interact/route.ts`

- Accepts `domain` and `title` in request body
- Auto-extracts domain from URL if not provided
- Auto-generates title with format `{domain}: {query}`

---

### 4. Domain Utility ✅
**File:** `lib/utils/domain.ts`

- `extractDomain(url)` - Extracts root domain from URL
- `generateSessionTitle(domain, taskDescription)` - Generates session title
- Handles multi-part TLDs (co.uk, com.au, etc.)
- Handles special cases (localhost, IP addresses)

---

### 5. Schemas Updated ✅
**File:** `lib/agent/schemas.ts`

- `interactRequestBodySchema` - Added `domain` and `title` fields
- `listSessionsResponseSchema` - Added domain fields
- `latestSessionResponseSchema` - Added domain fields
- `renameSessionRequestSchema` - New schema for rename endpoint
- `renameSessionResponseSchema` - New schema for rename response
- `sessionByDomainResponseSchema` - New schema for by-domain endpoint
- `getSessionResponseSchema` - New schema for single session
- `sessionMessagesResponseSchema` - Added `sessionExists` flag

---

## Domain Extraction Logic

The domain extraction follows these rules:

1. **Standard domains:** Extract last 2 parts
   - `www.google.com` → `google.com`
   - `mail.google.com` → `google.com`

2. **Multi-part TLDs:** Extract last 3 parts
   - `www.example.co.uk` → `example.co.uk`
   - `app.company.com.au` → `company.com.au`

3. **Special cases:**
   - `localhost` → `localhost`
   - IP addresses → kept as-is
   - Single part hostnames → kept as-is

Supported multi-part TLDs:
- `.co.uk`, `.co.nz`, `.co.za`, `.co.in`, `.co.jp`, `.co.kr`
- `.com.au`, `.com.br`, `.com.mx`, `.com.sg`, `.com.hk`, `.com.tw`
- `.org.uk`, `.org.au`, `.net.au`, `.gov.uk`, `.ac.uk`, `.edu.au`

---

## Migration Notes

### Existing Sessions

When the extension starts, it runs a migration that:
1. Iterates through all sessions in local storage
2. Extracts domain from each session's URL
3. Updates sessions with the extracted domain

This ensures backward compatibility with sessions created before the domain-aware feature.

### Backend Migration

If implementing the backend changes, run a similar migration:

```sql
-- Extract domain from URL and update sessions
UPDATE sessions 
SET domain = CASE 
  WHEN url LIKE 'http://localhost%' OR url LIKE 'https://localhost%' THEN 'localhost'
  WHEN url REGEXP '^https?://[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+' THEN 
    SUBSTRING_INDEX(SUBSTRING_INDEX(url, '://', -1), '/', 1)
  ELSE 
    -- Extract last 2 parts of hostname (simplified)
    SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(url, '://', -1), '/', 1), '.', -2)
END
WHERE domain IS NULL AND url IS NOT NULL;
```

Note: For production, use a more robust domain extraction that handles multi-part TLDs.

---

## Testing

### Frontend Test Cases

1. **New domain navigation:**
   - Navigate to google.com → new session created with "google.com: New Task"
   - Navigate to github.com → new session created with "github.com: New Task"

2. **Same domain navigation:**
   - On google.com session, navigate to google.com/search → stays on same session
   - URL updates but session doesn't change

3. **Domain switching:**
   - Have active sessions for google.com and github.com
   - Navigate between them → sessions switch automatically

4. **Session rename:**
   - Rename session via drawer
   - Domain prefix preserved
   - Title updates correctly

5. **Migration:**
   - Sessions without domain field get domain extracted from URL
   - Domain badge appears correctly in drawer

### Backend Test Cases

1. **PATCH /api/session/{id}** - Rename session
2. **GET /api/session** - Returns domain and isRenamed fields
3. **POST /api/session** - Accepts domain field
