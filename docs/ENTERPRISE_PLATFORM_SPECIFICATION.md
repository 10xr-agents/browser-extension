# Enterprise Platform Specification

**⚠️ CLIENT-SIDE INFORMATION CONSOLIDATED**

**Client-side implementation details have been consolidated.** All client-side architecture and implementation details are now documented in **[CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md)**.

**For client-side information, see:**
- **[CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md)** — Complete client-side architecture
- **[THIN_CLIENT_ROADMAP.md](./THIN_CLIENT_ROADMAP.md)** — Detailed task-based implementation reference

**This document focuses on enterprise platform specification (server-side infrastructure, multi-tenant architecture, RAG pipeline).** Client-side parts are documented in CLIENT_ARCHITECTURE.md.

---

**Document Version:** 1.1  
**Date:** January 25, 2026  
**Status:** Technical Specification — **Server-Side & Enterprise Focus**  
**Target:** Commercial B2B Enterprise Platform  
**Changelog (1.1):** Merged DOM processing documentation (§3.5, §3.6), merged Extension Thin Client Migration (§5.7), updated to MongoDB/Mongoose stack, fixed section numbering.

**Sync:** This document is the **comprehensive enterprise specification** (server-side). Client-side implementation is in `CLIENT_ARCHITECTURE.md`. Implementation roadmaps are in `THIN_SERVER_ROADMAP.md` (backend) and `THIN_CLIENT_ROADMAP.md` (extension). Keep all documents in sync.

---

## Executive Summary

This specification defines the evolution of Spadeworks Copilot AI from a consumer browser extension into a commercial B2B enterprise platform. The platform enables organizations to overlay AI-powered assistance onto their existing workflows, including internal intranets, password-protected portals, and third-party SaaS applications that lack native AI capabilities.

The solution functions as an **on-the-job navigational assistant** that trains employees on internal processes within their existing workflows, without requiring modifications to underlying applications.

### Core Value Propositions

1. **Zero-Disruption Deployment**: Works with existing applications without code changes
2. **Enterprise-Grade Security**: Multi-tenant isolation, SSO/SAML, and role-based access control
3. **Contextual Intelligence**: Private knowledge injection via RAG for company-specific guidance
4. **Workflow Integration**: Seamless overlay on protected corporate environments

---

## Quick Reference: Critical Upgrades

### Infrastructure Upgrades

**Current State:** No backend - all logic in extension  
**Required:** Full backend API server

**Components:**
- **API Server:** Node.js/TypeScript with Next.js (App Router)
- **Database:** **MongoDB** (Mongoose ODM for all persistence except Better Auth)
- **Auth:** **Better Auth** (Prisma) — users, sessions, accounts managed by Prisma only
- **Vector DB:** **MongoDB Atlas Vector Search** (or Pinecone/Weaviate for scale)
- **Cache:** Redis for sessions and caching
- **Queue:** Bull/BullMQ for background jobs (document processing)
- **Storage:** S3/Blob Storage for document files
- **Secrets:** AWS KMS/Azure Key Vault for encryption keys

**Key Services:**
```
Authentication Service → SSO/SAML, JWT management
Tenant Service → Multi-tenant context, domain allowlists
RAG Service → Document ingestion, embeddings, vector search
Task Service → Task execution, history, analytics
Audit Service → Compliance logging, audit trails
```

### Security Upgrades

**Current:** API key in localStorage  
**Required:** SSO/SAML + JWT tokens

**Extension Changes:**
```typescript
// Before
const apiKey = localStorage.getItem('openAIKey');

// After
const token = await getAuthToken(); // JWT from SSO
const response = await fetch(`${API_BASE}/api/v1/...`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### State Management Upgrades

**Current State (Zustand):**
```typescript
{
  currentTask: { ... },
  ui: { ... },
  settings: { ... }
}
```

**Enterprise State (Enhanced):**
```typescript
{
  // Existing
  currentTask: { ... },
  ui: { ... },
  settings: { ... },
  
  // New
  auth: {
    token: string;
    refreshToken: string;
    user: User;
    tenant: Tenant;
  },
  security: {
    permissions: Permission[];
    allowedDomains: string[];
    role: string;
  },
  knowledge: {
    ragContext: RAGContext | null;
    citations: Citation[];
    knowledgeBase: Document[];
  },
  overlay: {
    showTooltips: boolean;
    showGuidance: boolean;
    currentStep: number;
  }
}
```

### API Integration Changes

**Current: Direct OpenAI API**
```typescript
const openai = new OpenAI({ apiKey });
const completion = await openai.chat.completions.create({ ... });
```

**Enterprise: Backend API Proxy**
```typescript
// Extension calls backend API
const response = await fetch(`${API_BASE}/api/v1/llm/complete`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages,
    ragContext, // RAG context from knowledge base
  }),
});

// Backend handles:
// - Tenant context validation
// - RAG context injection
// - Rate limiting
// - Audit logging
// - Token usage tracking
```

---

## Table of Contents

1. [Multi-Tenant Architecture & Security](#1-multi-tenant-architecture--security)
2. [Private Knowledge Injection (RAG Pipeline)](#2-private-knowledge-injection-rag-pipeline)
3. [Contextual Overlay Mechanics](#3-contextual-overlay-mechanics)
   - [3.5 DOM Processing Pipeline](#35-dom-processing-pipeline)
   - [3.6 DOM Processing Improvements & Future Enhancements](#36-dom-processing-improvements--future-enhancements)
   - [3.7 Real-Time Context Awareness](#37-real-time-context-awareness)
   - [3.8 Security & Compliance in Overlay](#38-security--compliance-in-overlay)
4. [Infrastructure Requirements](#4-infrastructure-requirements)
5. [Migration Path from Current Architecture](#5-migration-path-from-current-architecture)
   - [5.7 Extension Thin Client Migration](#57-extension-thin-client-migration)
6. [Implementation Roadmap](#6-implementation-roadmap)

---

## 1. Multi-Tenant Architecture & Security

### 1.1 Architecture Overview

The multi-tenant architecture ensures complete data isolation between organizations while maintaining scalability and performance. Each tenant operates in a logically isolated environment with dedicated resources and security boundaries.

#### 1.1.1 Tenant Isolation Strategy

**Schema-Level Isolation (Recommended)**
- Each tenant receives a dedicated database schema or namespace
- Schema naming convention: `tenant_{tenant_id}`
- Cross-schema queries prevented at database level
- Tenant ID enforced in all queries via middleware

**Row-Level Security (Alternative)**
- Single shared database with tenant_id column on all tables
- Database-level RLS policies enforce tenant isolation
- Application-level tenant context middleware validates all operations
- Suitable for smaller deployments with strong RLS support

**Hybrid Approach (Production Recommended)**
- Critical data (knowledge base, user data) in tenant-specific schemas
- Shared infrastructure tables (tenants, subscriptions) in shared schema
- Cross-tenant analytics in read-only aggregated views

### 1.2 Database Schema Design

**Note:** **Prisma** is used **only** for Better Auth models (users, sessions, accounts, verifications). All other persistence uses **Mongoose** with MongoDB.

#### 1.2.1 Core Tenant Schema (MongoDB + Mongoose)

```typescript
// models/Tenant.ts
import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, unique: true, index: true }, // UUID
  name: { type: String, required: true },
  subdomain: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ['active', 'suspended', 'trial', 'cancelled'], default: 'active' },
  planTier: { type: String, enum: ['starter', 'professional', 'enterprise'], required: true },
  allowedDomains: [{ type: String }], // e.g. ['*.company.com', 'app.saas.com']
  metadata: { type: mongoose.Schema.Types.Mixed }, // Custom tenant configuration
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const Tenant = mongoose.model('Tenant', tenantSchema);
```

**Better Auth (Prisma):** Users, sessions, accounts are managed by Prisma per Better Auth configuration. Users have `tenantId` field linking to Tenant collection.

```typescript
// models/Role.ts
const roleSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  permissions: {
    actions: [{ type: String }], // e.g. ['click', 'setValue']
    domains: [{ type: String }], // e.g. ['*.company.com']
  },
  createdAt: { type: Date, default: Date.now },
});

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Role = mongoose.model('Role', roleSchema);
```

```typescript
// models/UserRole.ts
const userRoleSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  userId: { type: String, required: true }, // UUID from Better Auth
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  assignedAt: { type: Date, default: Date.now },
});

userRoleSchema.index({ tenantId: 1, userId: 1, roleId: 1 }, { unique: true });

export const UserRole = mongoose.model('UserRole', userRoleSchema);
```

**Knowledge Base (Mongoose):** RAG implementation is server-side. See `THIN_SERVER_ROADMAP.md` and `SERVER_SIDE_AGENT_ARCH.md` for RAG architecture and retrieval logic. Knowledge schemas are implemented in the server codebase.

**Task History (Mongoose):** See `SERVER_SIDE_AGENT_ARCH.md` §4.4 for `Task` and `TaskAction` schemas.

```typescript
// models/AllowedDomain.ts
const allowedDomainSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  domainPattern: { type: String, required: true }, // e.g. '*.company.com', 'app.saas.com'
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

allowedDomainSchema.index({ tenantId: 1, domainPattern: 1 }, { unique: true });

export const AllowedDomain = mongoose.model('AllowedDomain', allowedDomainSchema);
```

```typescript
// models/SSOConfig.ts
const ssoConfigSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  provider: { type: String, enum: ['saml', 'oidc', 'okta', 'azure_ad'], required: true },
  configEncrypted: { type: Buffer, required: true }, // Encrypted SSO configuration
  encryptionKeyId: { type: String }, // Reference to key management
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const SSOConfig = mongoose.model('SSOConfig', ssoConfigSchema);
```

#### 1.2.2 Security Schema (MongoDB + Mongoose)

```typescript
// models/ApiKey.ts
const apiKeySchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  keyName: { type: String, required: true },
  keyHash: { type: String, required: true }, // Hashed API key
  keyEncrypted: { type: Buffer }, // Encrypted key for retrieval (optional)
  scopes: {
    llm: { type: Boolean, default: false },
    rag: { type: Boolean, default: false },
  },
  lastUsedAt: { type: Date },
  expiresAt: { type: Date },
  createdBy: { type: String }, // UUID from Better Auth
  createdAt: { type: Date, default: Date.now },
});

apiKeySchema.index({ tenantId: 1, keyName: 1 }, { unique: true });

export const ApiKey = mongoose.model('ApiKey', apiKeySchema);
```

```typescript
// models/AuditLog.ts
const auditLogSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  userId: { type: String, index: true }, // UUID from Better Auth
  action: { type: String, required: true }, // login, task_start, document_upload, etc.
  resourceType: { type: String }, // user, document, task, etc.
  resourceId: { type: String }, // UUID or ObjectId
  ipAddress: { type: String },
  userAgent: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
});

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
```

**Session Management:** Better Auth (Prisma) manages sessions. No separate Mongoose schema needed.

### 1.3 Authentication & Authorization

#### 1.3.1 SSO/SAML Integration

**SAML 2.0 Flow**
```
1. User clicks "Sign in with SSO" in extension
2. Extension redirects to tenant's SSO provider
3. User authenticates with corporate credentials
4. SSO provider returns SAML assertion
5. Backend validates assertion and extracts user attributes
6. Backend creates/updates user record in tenant schema
7. Backend issues JWT token with tenant context
8. Extension stores token securely (encrypted storage)
9. All subsequent API calls include token in Authorization header
```

**OIDC/OAuth 2.0 Flow**
```
1. Extension initiates OAuth flow with tenant's identity provider
2. User authenticates and grants consent
3. Provider returns authorization code
4. Backend exchanges code for ID token and access token
5. Backend validates ID token and extracts claims
6. Backend maps claims to user record
7. Backend issues platform JWT token
8. Extension uses platform token for API calls
```

**Implementation Requirements:**
- Support for major providers: Okta, Azure AD, Google Workspace, Auth0
- SAML metadata parsing and validation
- Attribute mapping configuration per tenant
- Just-in-time (JIT) user provisioning
- Session management with refresh tokens
- Token encryption at rest in extension storage

#### 1.3.2 Role-Based Access Control (RBAC)

**Role Hierarchy:**
```
Super Admin (Tenant-level)
  ├── Admin (Department/Team-level)
  │   ├── Manager (Team-level)
  │   │   ├── User (Standard access)
  │   │   └── Viewer (Read-only)
```

**Permission Model:**
```typescript
interface Permission {
  // Action permissions
  actions: {
    execute_tasks: boolean;
    view_history: boolean;
    manage_knowledge: boolean;
    manage_users: boolean;
    view_analytics: boolean;
  };
  
  // Domain restrictions
  allowed_domains: string[]; // ["*.company.com", "app.saas.com"]
  blocked_domains: string[]; // Explicit blocks
  
  // Feature flags
  features: {
    rag_enabled: boolean;
    custom_actions: boolean;
    api_access: boolean;
  };
  
  // Resource limits
  limits: {
    max_tasks_per_day: number;
    max_knowledge_documents: number;
    max_token_usage_per_month: number;
  };
}
```

**RBAC Implementation:**
- Permissions stored as JSONB in roles table
- Middleware validates permissions on every API call
- Extension enforces domain restrictions client-side
- Audit logging for all permission checks

### 1.4 Data Isolation Enforcement

#### 1.4.1 Application-Level Isolation

**Tenant Context Middleware:**
```typescript
// Backend middleware
async function tenantContextMiddleware(req, res, next) {
  // Extract tenant ID from JWT token
  const tenantId = req.user.tenantId;
  
  // Verify tenant is active
  const tenant = await getTenant(tenantId);
  if (tenant.status !== 'active') {
    return res.status(403).json({ error: 'Tenant inactive' });
  }
  
  // Attach tenant context to request
  req.tenantContext = {
    tenantId,
    schema: `tenant_${tenantId}`,
    permissions: req.user.permissions
  };
  
  // Enforce tenant isolation in all queries
  next();
}

// Database query wrapper
async function queryWithTenant(sql, params, tenantContext) {
  // Ensure tenant_id is in WHERE clause
  const validatedSQL = enforceTenantIsolation(sql, tenantContext.tenantId);
  return db.query(validatedSQL, params);
}
```

#### 1.4.2 Database-Level Isolation

**Tenant Isolation (MongoDB):**
```typescript
// All Mongoose queries MUST include tenantId filter
// Example helper function:
async function queryWithTenant<T>(
  model: mongoose.Model<T>,
  filter: Record<string, unknown>,
  tenantId: string
): Promise<T[]> {
  return model.find({ ...filter, tenantId }).exec();
}
```
-- Enable RLS on all tenant tables
ALTER TABLE tenant_{tenant_id}.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's data
CREATE POLICY tenant_isolation_users ON tenant_{tenant_id}.users
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Similar policies for all tables
```

**Connection Pooling:**
- Separate connection pools per tenant (for schema-level isolation)
- Connection string includes schema: `search_path=tenant_{tenant_id}`
- Connection limits per tenant to prevent resource exhaustion

### 1.5 Encryption & Key Management

#### 1.5.1 Data Encryption

**Encryption at Rest:**
- Database encryption: PostgreSQL TDE or cloud provider encryption
- File storage: S3 server-side encryption (SSE-S3 or SSE-KMS)
- Knowledge documents: Encrypted before storage
- API keys: Encrypted with tenant-specific keys

**Encryption in Transit:**
- TLS 1.3 for all API communications
- HTTPS-only for extension communication
- Certificate pinning in extension (optional, for high-security tenants)

**Key Management:**
- AWS KMS, Azure Key Vault, or HashiCorp Vault
- Tenant-specific encryption keys
- Key rotation policies
- Audit logging for key access

#### 1.5.2 Secrets Management

**Extension Storage:**
```typescript
// Encrypted storage in extension
interface EncryptedStorage {
  // JWT token (encrypted)
  authToken: string; // Encrypted with browser keychain
  
  // Tenant configuration (encrypted)
  tenantConfig: {
    tenantId: string;
    subdomain: string;
    apiEndpoint: string;
  };
  
  // User preferences (unencrypted, non-sensitive)
  preferences: {
    selectedModel: string;
    theme: string;
  };
}

// Use Chrome Storage API with encryption
async function storeEncrypted(key: string, value: any) {
  const encrypted = await encrypt(value, await getEncryptionKey());
  await chrome.storage.local.set({ [key]: encrypted });
}
```

### 1.6 Compliance & Auditing

#### 1.6.1 Audit Logging

**Comprehensive Audit Trail:**
- All authentication events (login, logout, SSO)
- All data access (knowledge base queries, task execution)
- All configuration changes (user management, domain allowlists)
- All API key usage
- All permission changes

**Audit Log Schema:**
```typescript
interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  timestamp: Date;
  action: string; // "task_started", "document_uploaded", "user_created"
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, any>;
  result: "success" | "failure";
}
```

#### 1.6.2 Compliance Features

**GDPR Compliance:**
- Right to access: Export all user data
- Right to deletion: Soft delete with retention policies
- Data portability: JSON export of all tenant data
- Consent management: Track user consent for data processing

**SOC 2 Type II:**
- Access controls and authentication
- Encryption at rest and in transit
- Audit logging and monitoring
- Incident response procedures

**HIPAA (Healthcare Tenants):**
- BAA (Business Associate Agreement) support
- Enhanced encryption requirements
- Access logging for PHI
- Data retention policies

---

## 2. Private Knowledge Injection (RAG Pipeline)

### 2.1 RAG Architecture Overview

The RAG (Retrieval-Augmented Generation) pipeline enables organizations to inject proprietary knowledge into the AI assistant, allowing it to provide contextually relevant guidance based on internal documentation, SOPs, compliance manuals, and training materials.

#### 2.1.1 RAG Flow

```
1. Document Ingestion
   ├── Upload (PDF, DOCX, Markdown, HTML, Text)
   ├── Text Extraction
   ├── Chunking Strategy
   └── Embedding Generation

2. Vector Storage
   ├── Embedding Storage (PostgreSQL pgvector or Pinecone/Weaviate)
   ├── Metadata Indexing
   └── Similarity Search Index

3. Query-Time Retrieval
   ├── User Query → Query Embedding
   ├── Similarity Search (Top-K chunks)
   ├── Relevance Filtering
   └── Context Assembly

4. LLM Context Injection
   ├── Retrieved Chunks + User Query
   ├── Prompt Engineering
   ├── LLM Completion
   └── Response with Citations
```

### 2.2 Document Ingestion Pipeline

#### 2.2.1 Supported Formats

**Document Types:**
- PDF (via pdf-parse or pdf.js)
- DOCX (via mammoth or docx)
- Markdown (.md files)
- HTML (cleaned and extracted)
- Plain Text (.txt)
- CSV (structured data extraction)
- Images with OCR (future enhancement)

**File Size Limits:**
- Per document: 50 MB
- Per tenant: 10 GB total storage
- Enterprise tier: Custom limits

#### 2.2.2 Text Extraction & Processing

**Extraction Pipeline:**
```typescript
interface DocumentProcessor {
  extractText(file: File): Promise<string>;
  cleanText(text: string): string;
  detectLanguage(text: string): string;
  extractMetadata(file: File): DocumentMetadata;
}

interface DocumentMetadata {
  title: string;
  author?: string;
  createdAt?: Date;
  pageCount?: number;
  wordCount: number;
  language: string;
  tags?: string[];
  category?: string;
}
```

**Text Cleaning:**
- Remove excessive whitespace
- Normalize line breaks
- Remove headers/footers (if detected)
- Preserve structure (headings, lists, tables)
- Handle special characters and encoding

#### 2.2.3 Chunking Strategy

**Intelligent Chunking:**
```typescript
interface ChunkingStrategy {
  // Semantic chunking (preferred)
  semanticChunking(
    text: string,
    options: {
      maxChunkSize: number; // 1000 tokens
      overlap: number; // 200 tokens
      respectBoundaries: boolean; // Respect paragraph/section boundaries
    }
  ): Chunk[];

  // Fixed-size chunking (fallback)
  fixedChunking(
    text: string,
    chunkSize: number,
    overlap: number
  ): Chunk[];
}

interface Chunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  startChar: number;
  endChar: number;
  metadata: {
    page?: number;
    section?: string;
    heading?: string;
  };
}
```

**Chunking Best Practices:**
- Respect semantic boundaries (paragraphs, sections)
- Maintain context with overlap between chunks
- Preserve document structure (headings, lists)
- Handle tables and structured data specially
- Token-aware chunking (not just character count)

#### 2.2.4 Embedding Generation

**Embedding Models:**
- Primary: OpenAI `text-embedding-3-large` (3072 dimensions) or `text-embedding-3-small` (1536 dimensions)
- Alternative: Cohere, Hugging Face models
- Tenant-configurable model selection

**Embedding Pipeline:**
```typescript
async function generateEmbeddings(chunks: Chunk[]): Promise<Embedding[]> {
  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: chunks.map(c => c.content),
    dimensions: 1536, // Configurable
  });
  
  return chunks.map((chunk, i) => ({
    chunkId: chunk.id,
    embedding: embeddings.data[i].embedding,
    model: 'text-embedding-3-large',
  }));
}
```

**Batch Processing:**
- Process chunks in batches (100 at a time)
- Rate limit handling for API calls
- Retry logic for failed embeddings
- Progress tracking for large documents

### 2.3 Vector Storage & Retrieval

#### 2.3.1 Vector Database Options

**Option 1: MongoDB Atlas Vector Search (Recommended for Multi-Tenant)**
- Integrated with MongoDB (same database as application data)
- Multi-tenant isolation via `tenantId` field
- Cost-effective for <100K chunks per tenant
- Create vector search index via MongoDB Atlas UI or CLI

**MongoDB Atlas Vector Search Index:**
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,  // or 3072 for text-embedding-3-large
      "similarity": "cosine"
    }
  ]
}
```

**Mongoose Schema:** RAG schemas are server-side. See `THIN_SERVER_ROADMAP.md` and `SERVER_SIDE_AGENT_ARCH.md` for `KnowledgeChunk` schema with `embedding` field and vector search implementation.

**Vector Search Query:** See `THIN_SERVER_ROADMAP.md` and `SERVER_SIDE_AGENT_ARCH.md` for MongoDB Atlas Vector Search aggregation pipeline examples and RAG retrieval logic.

**Option 2: Dedicated Vector Database (Pinecone/Weaviate)**
- Better for very large knowledge bases (>100K chunks)
- Managed service reduces operational overhead
- Tenant isolation via namespaces/collections
- Higher cost but better scalability
- Store chunk metadata in MongoDB; embeddings in vector DB

**Option 3: Hybrid Approach**
- MongoDB Atlas Vector Search for metadata and small tenants
- Pinecone/Weaviate for enterprise tenants with large KBs
- Automatic migration based on size thresholds

#### 2.3.2 Similarity Search

**Query-Time Retrieval:**
```typescript
interface RetrievalOptions {
  topK: number; // Default: 5
  similarityThreshold: number; // Default: 0.7
  filters?: {
    documentIds?: string[];
    categories?: string[];
    tags?: string[];
    dateRange?: { start: Date; end: Date };
  };
}

async function retrieveRelevantChunks(
  query: string,
  tenantId: string,
  options: RetrievalOptions
): Promise<RetrievedChunk[]> {
  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  
  // 2. Perform similarity search
  const chunks = await vectorDB.similaritySearch(
    queryEmbedding,
    {
      tenantId,
      topK: options.topK,
      filters: options.filters,
    }
  );
  
  // 3. Filter by similarity threshold
  const relevantChunks = chunks.filter(
    c => c.similarity >= options.similarityThreshold
  );
  
  // 4. Re-rank if needed (optional, using cross-encoder)
  const reranked = await rerankChunks(query, relevantChunks);
  
  return reranked;
}
```

**Hybrid Search (Semantic + Keyword):**
```typescript
// Combine vector similarity with BM25 keyword search
async function hybridSearch(
  query: string,
  tenantId: string,
  options: RetrievalOptions
): Promise<RetrievedChunk[]> {
  // Vector similarity search
  const vectorResults = await vectorSimilaritySearch(query, tenantId);
  
  // Keyword search (BM25)
  const keywordResults = await keywordSearch(query, tenantId);
  
  // Combine and re-rank
  const combined = combineResults(vectorResults, keywordResults);
  return rerank(combined);
}
```

#### 2.3.3 Metadata Filtering

**Filtering Capabilities:**
- Filter by document ID
- Filter by category/tags
- Filter by date range
- Filter by document status
- Filter by user permissions (document-level access control)

**Implementation:**
```typescript
interface MetadataFilter {
  documentIds?: string[];
  categories?: string[];
  tags?: string[];
  dateRange?: { start: Date; end: Date };
  status?: 'active' | 'archived';
  accessLevel?: string[]; // User's access levels
}

// Apply filters in vector search
const filteredChunks = await vectorDB.search({
  embedding: queryEmbedding,
  filters: {
    tenant_id: tenantId,
    ...metadataFilter,
  },
  topK: 10,
});
```

### 2.4 LLM Context Injection

#### 2.4.1 Prompt Engineering

**RAG-Enhanced Prompt:**
```typescript
function buildRAGPrompt(
  userQuery: string,
  retrievedChunks: RetrievedChunk[],
  taskContext: TaskContext
): string {
  const knowledgeContext = retrievedChunks
    .map((chunk, i) => {
      return `[Document ${i + 1}: ${chunk.documentTitle}]
${chunk.content}

Source: ${chunk.documentId}, Section: ${chunk.metadata.section || 'N/A'}`;
    })
    .join('\n\n---\n\n');

  return `You are an AI assistant helping employees navigate internal processes and systems.

RELEVANT COMPANY KNOWLEDGE:
${knowledgeContext}

CURRENT TASK:
${taskContext.instructions}

CURRENT PAGE CONTEXT:
${taskContext.simplifiedDOM}

PREVIOUS ACTIONS:
${formatActionHistory(taskContext.actionHistory)}

INSTRUCTIONS:
1. Use the company knowledge above to provide accurate, contextually relevant guidance
2. When referencing internal processes, cite the source document
3. If the knowledge base doesn't contain relevant information, indicate this clearly
4. Follow the standard action format: <Thought>...</Thought><Action>...</Action>

User Query: ${userQuery}`;
}
```

**Citation Format:**
```typescript
interface Citation {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  section?: string;
  page?: number;
  similarity: number;
}

// LLM response includes citations
interface RAGResponse {
  thought: string;
  action: string;
  citations: Citation[];
  confidence: number;
}
```

#### 2.4.2 Context Window Management

**Token Budget Allocation:**
```
Total Context Window: 128K tokens (GPT-4 Turbo)
├── System Message: 2K tokens
├── Knowledge Chunks: 20K tokens (configurable)
├── Current DOM: 30K tokens (simplified)
├── Action History: 10K tokens (last 20 actions)
├── User Query: 1K tokens
└── Buffer: 5K tokens
```

**Dynamic Context Selection:**
- Prioritize most relevant chunks
- Truncate less relevant chunks if needed
- Maintain minimum context for coherence
- Fallback to keyword search if vector search fails

#### 2.4.3 Multi-Document Context

**Document Aggregation:**
- Retrieve chunks from multiple documents
- Deduplicate similar content
- Prioritize by relevance score
- Maintain document boundaries in context

**Cross-Document Reasoning:**
- LLM can reason across multiple documents
- Citations track which document contributed to answer
- Confidence scores per document

### 2.5 Knowledge Base Management

#### 2.5.1 Document Lifecycle

**Upload & Processing:**
```
1. User uploads document via web UI or API
2. Document stored in encrypted S3/blob storage
3. Background job processes document:
   ├── Extract text
   ├── Generate chunks
   ├── Generate embeddings
   ├── Store in vector DB
   └── Update document status
4. User notified of completion
```

**Versioning:**
- Track document versions
- Maintain historical embeddings
- Support document updates (incremental re-indexing)
- Archive old versions

**Deletion:**
- Soft delete (mark as archived)
- Hard delete after retention period
- Cascade delete chunks and embeddings
- Audit log all deletions

#### 2.5.2 Access Control

**Document-Level Permissions:**
```typescript
interface DocumentPermission {
  documentId: string;
  userId?: string;
  roleId?: string;
  accessLevel: 'read' | 'write' | 'admin';
}

// Users can only retrieve chunks from documents they have access to
const accessibleDocs = await getAccessibleDocuments(userId, tenantId);
const chunks = await retrieveChunks(query, {
  filters: {
    documentIds: accessibleDocs,
  },
});
```

#### 2.5.3 Quality & Validation

**Content Validation:**
- Check for empty or corrupted documents
- Validate text extraction quality
- Detect language and validate
- Check for sensitive data (PII, credentials)

**Embedding Quality:**
- Validate embedding dimensions
- Check for failed embeddings
- Monitor embedding API errors
- Retry failed chunks

**Search Quality Metrics:**
- Track retrieval relevance (user feedback)
- Monitor query success rates
- A/B test different chunking strategies
- Track citation accuracy

### 2.6 RAG Integration with Browser Extension

#### 2.6.1 Extension-Side RAG Query

**Query Flow:**
```typescript
// In extension (determineNextAction.ts)
async function determineNextActionWithRAG(
  taskInstructions: string,
  previousActions: ParsedResponseSuccess[],
  simplifiedDOM: string,
  currentUrl: string
) {
  // 1. Extract query intent from task instructions
  const queryIntent = extractQueryIntent(taskInstructions, simplifiedDOM);
  
  // 2. Query RAG system for relevant knowledge
  const ragContext = await queryRAGSystem({
    query: queryIntent,
    url: currentUrl,
    tenantId: getTenantId(),
  });
  
  // 3. Build enhanced prompt with RAG context
  const prompt = formatPromptWithRAG(
    taskInstructions,
    previousActions,
    simplifiedDOM,
    ragContext
  );
  
  // 4. Call LLM with enhanced context
  return await callLLM(prompt);
}

async function queryRAGSystem(options: {
  query: string;
  url: string;
  tenantId: string;
}): Promise<RAGContext> {
  const response = await fetch(`${API_BASE}/api/v1/rag/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: options.query,
      url: options.url,
      topK: 5,
      filters: {
        // Optional: Filter by URL domain
        domain: extractDomain(options.url),
      },
    }),
  });
  
  return response.json();
}
```

#### 2.6.2 Caching Strategy

**Client-Side Caching:**
- Cache RAG results for similar queries
- Cache key: hash(query + url + tenantId)
- TTL: 1 hour (configurable)
- Invalidate on document updates

**Server-Side Caching:**
- Cache embeddings for common queries
- Redis cache for frequent queries
- Cache invalidation on knowledge base updates

---

## 3. Contextual Overlay Mechanics

### 3.1 Secure DOM Interaction Architecture

The contextual overlay must securely interact with protected DOM elements behind corporate firewalls while maintaining security boundaries and respecting access controls.

#### 3.1.1 Content Script Isolation

**Current Architecture (Enhanced):**
- Content script runs in isolated world (cannot access page JavaScript)
- DOM access via direct DOM API
- Action execution via Chrome Debugger API
- No cross-origin restrictions for content scripts

**Enterprise Enhancements:**
```typescript
// Enhanced content script with security context
interface SecurityContext {
  tenantId: string;
  userId: string;
  permissions: Permission[];
  allowedDomains: string[];
  sessionToken: string;
}

// Validate domain before DOM access
function validateDomainAccess(url: string, securityContext: SecurityContext): boolean {
  const domain = extractDomain(url);
  
  // Check against tenant allowlist
  const isAllowed = securityContext.allowedDomains.some(
    pattern => matchDomainPattern(domain, pattern)
  );
  
  if (!isAllowed) {
    logSecurityEvent({
      type: 'domain_blocked',
      userId: securityContext.userId,
      tenantId: securityContext.tenantId,
      domain,
    });
    return false;
  }
  
  return true;
}
```

#### 3.1.2 Protected Element Detection

**Element Classification:**
```typescript
interface ElementSecurityContext {
  elementId: number;
  isProtected: boolean;
  protectionLevel: 'public' | 'internal' | 'restricted' | 'confidential';
  requiresAuth: boolean;
  allowedRoles: string[];
}

// Detect protected elements during DOM annotation
function annotateElementSecurity(element: HTMLElement): ElementSecurityContext {
  // Check for security attributes
  const dataProtected = element.getAttribute('data-protected');
  const dataRole = element.getAttribute('data-role-required');
  const ariaLabel = element.getAttribute('aria-label');
  
  // Heuristic detection
  const isPasswordField = element.type === 'password';
  const isSensitiveInput = element.classList.contains('sensitive');
  const isAdminOnly = element.classList.contains('admin-only');
  
  return {
    isProtected: dataProtected === 'true' || isPasswordField || isSensitiveInput,
    protectionLevel: determineProtectionLevel(element),
    requiresAuth: isPasswordField || isSensitiveInput,
    allowedRoles: parseRoles(dataRole),
  };
}
```

**Access Control Enforcement:**
```typescript
// Before executing action, validate element access
async function validateElementAccess(
  elementId: number,
  securityContext: SecurityContext
): Promise<boolean> {
  const element = getElementById(elementId);
  const elementSecurity = annotateElementSecurity(element);
  
  // Check if element is protected
  if (elementSecurity.isProtected) {
    // Check user permissions
    const hasAccess = securityContext.permissions.actions.includes('execute_tasks') &&
      (elementSecurity.allowedRoles.length === 0 ||
       elementSecurity.allowedRoles.some(role => 
         securityContext.permissions.roles.includes(role)
       ));
    
    if (!hasAccess) {
      logSecurityEvent({
        type: 'element_access_denied',
        userId: securityContext.userId,
        elementId,
        reason: 'insufficient_permissions',
      });
      return false;
    }
  }
  
  return true;
}
```

### 3.2 Cross-Origin & Firewall Handling

#### 3.2.1 CORS & CSP Bypass

**Challenge:**
- Corporate intranets may have strict CORS policies
- Content Security Policies may block extension scripts
- Firewall rules may restrict external API calls

**Solutions:**

**1. Extension Manifest Permissions:**
```json
{
  "permissions": [
    "tabs",
    "activeTab",
    "storage",
    "clipboardWrite",
    "debugger",
    "management",
    "scripting" // For programmatic script injection
  ],
  "host_permissions": [
    "http://*/*",
    "https://*/*",
    "<all_urls>" // Required for cross-origin access
  ]
}
```

**2. Background Service Worker Proxy:**
```typescript
// Background service worker acts as proxy for API calls
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_REQUEST') {
    // Service worker can make cross-origin requests
    fetch(message.url, {
      method: message.method,
      headers: {
        'Authorization': `Bearer ${message.token}`,
        ...message.headers,
      },
      body: message.body,
    })
      .then(response => response.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error }));
    
    return true; // Async response
  }
});
```

**3. Content Script Communication:**
```typescript
// Content script communicates via background worker
async function makeAPICall(endpoint: string, data: any) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `${API_BASE}${endpoint}`,
      method: 'POST',
      body: JSON.stringify(data),
      token: await getAuthToken(),
    }, (response) => {
      if (response.success) {
        resolve(response.data);
      } else {
        reject(response.error);
      }
    });
  });
}
```

#### 3.2.2 Intranet Access Patterns

**Internal Domain Detection:**
```typescript
function isInternalDomain(url: string): boolean {
  const domain = extractDomain(url);
  
  // Common internal domain patterns
  const internalPatterns = [
    /\.local$/,
    /\.internal$/,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
  ];
  
  return internalPatterns.some(pattern => pattern.test(domain));
}

// Handle internal domains differently
if (isInternalDomain(currentUrl)) {
  // Use internal API endpoint if configured
  const apiEndpoint = tenantConfig.internalApiEndpoint || defaultApiEndpoint;
  // Use internal authentication if required
  const authToken = await getInternalAuthToken();
}
```

**VPN & Network Detection:**
```typescript
// Detect if user is on corporate network
async function detectNetworkContext(): Promise<NetworkContext> {
  try {
    // Try to reach internal API endpoint
    const response = await fetch('https://internal-api.company.com/health', {
      method: 'GET',
      mode: 'no-cors', // Bypass CORS for detection
    });
    
    return {
      isInternal: true,
      requiresVPN: false,
    };
  } catch (error) {
    // May require VPN
    return {
      isInternal: false,
      requiresVPN: true,
    };
  }
}
```

### 3.3 Secure Action Execution

#### 3.3.1 Action Validation Pipeline

**Pre-Execution Validation:**
```typescript
interface ActionValidationResult {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
}

async function validateAction(
  action: ParsedAction,
  securityContext: SecurityContext,
  currentUrl: string
): Promise<ActionValidationResult> {
  // 1. Validate domain access
  if (!validateDomainAccess(currentUrl, securityContext)) {
    return {
      allowed: false,
      reason: 'Domain not in allowlist',
    };
  }
  
  // 2. Validate element access
  if (action.name === 'click' || action.name === 'setValue') {
    const elementAccess = await validateElementAccess(
      action.args.elementId,
      securityContext
    );
    if (!elementAccess) {
      return {
        allowed: false,
        reason: 'Element access denied',
      };
    }
  }
  
  // 3. Check for sensitive actions
  if (isSensitiveAction(action)) {
    return {
      allowed: true,
      requiresApproval: true, // Require user confirmation
    };
  }
  
  // 4. Check rate limits
  if (await isRateLimited(securityContext.userId)) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded',
    };
  }
  
  return { allowed: true };
}
```

**Sensitive Action Detection:**
```typescript
function isSensitiveAction(action: ParsedAction): boolean {
  // Actions that modify data or trigger external calls
  const sensitiveActions = [
    'submit',
    'delete',
    'confirm',
    'setValue', // If value contains sensitive data
  ];
  
  if (sensitiveActions.includes(action.name)) {
    return true;
  }
  
  // Check if action targets sensitive elements
  if (action.name === 'setValue') {
    const element = getElementById(action.args.elementId);
    return isSensitiveInput(element);
  }
  
  return false;
}
```

#### 3.3.2 Action Execution with Audit Trail

**Enhanced Action Execution:**
```typescript
async function executeActionWithAudit(
  action: ParsedAction,
  securityContext: SecurityContext,
  taskContext: TaskContext
): Promise<ActionResult> {
  // 1. Log action attempt
  await auditLog.create({
    tenantId: securityContext.tenantId,
    userId: securityContext.userId,
    action: 'action_executed',
    resourceType: 'task_action',
    metadata: {
      actionType: action.name,
      elementId: action.args.elementId,
      url: taskContext.currentUrl,
      taskId: taskContext.taskId,
    },
  });
  
  // 2. Execute action
  try {
    const result = await executeAction(action, taskContext);
    
    // 3. Log success
    await auditLog.update({
      result: 'success',
      executionTime: result.executionTime,
    });
    
    return result;
  } catch (error) {
    // 4. Log failure
    await auditLog.update({
      result: 'failure',
      error: error.message,
    });
    
    throw error;
  }
}
```

### 3.4 Overlay UI Components

#### 3.4.1 Non-Intrusive Overlay

**Overlay Design Principles:**
- Non-blocking: Doesn't interfere with page functionality
- Dismissible: User can hide/show overlay
- Contextual: Only appears when relevant
- Accessible: Keyboard navigation, screen reader support

**Overlay Components:**
```typescript
// Overlay component injected into page
interface OverlayConfig {
  position: 'bottom-right' | 'top-right' | 'bottom-left';
  theme: 'light' | 'dark' | 'auto';
  showCitations: boolean;
  showConfidence: boolean;
}

// RAG-powered tooltips
function injectContextualTooltip(
  element: HTMLElement,
  knowledgeContext: RAGContext
) {
  const tooltip = createTooltip({
    content: knowledgeContext.summary,
    citations: knowledgeContext.citations,
    position: 'top',
  });
  
  element.addEventListener('mouseenter', () => {
    tooltip.show();
  });
  
  element.addEventListener('mouseleave', () => {
    tooltip.hide();
  });
}
```

#### 3.4.2 Inline Guidance

**Contextual Help Bubbles:**
```typescript
// Show help bubbles for complex forms
function injectFormGuidance(form: HTMLFormElement, knowledgeContext: RAGContext) {
  const fields = form.querySelectorAll('input, select, textarea');
  
  fields.forEach(field => {
    const fieldName = field.name || field.id;
    const relevantChunk = findRelevantChunk(fieldName, knowledgeContext);
    
    if (relevantChunk) {
      const helpBubble = createHelpBubble({
        content: relevantChunk.content,
        source: relevantChunk.documentTitle,
        position: 'right',
      });
      
      field.addEventListener('focus', () => {
        helpBubble.show();
      });
    }
  });
}
```

**Step-by-Step Guidance:**
```typescript
// Multi-step process guidance
interface ProcessStep {
  stepNumber: number;
  description: string;
  targetElement?: string;
  action?: string;
  knowledgeContext?: RAGContext;
}

function showProcessGuidance(
  steps: ProcessStep[],
  currentStep: number
) {
  const guidancePanel = createGuidancePanel({
    steps,
    currentStep,
    onNext: () => advanceStep(),
    onPrevious: () => goBackStep(),
  });
  
  // Highlight current step's target element
  if (steps[currentStep].targetElement) {
    highlightElement(steps[currentStep].targetElement);
  }
}
```

### 3.7 Real-Time Context Awareness

#### 3.7.1 URL-Based Context Switching

**Context Detection:**
```typescript
interface PageContext {
  url: string;
  domain: string;
  applicationType: 'saas' | 'intranet' | 'portal' | 'unknown';
  requiresAuth: boolean;
  detectedApp?: string; // 'salesforce', 'workday', etc.
}

async function detectPageContext(url: string): Promise<PageContext> {
  const domain = extractDomain(url);
  
  // Check against known application patterns
  const appPatterns = {
    salesforce: /\.salesforce\.com/,
    workday: /\.workday\.com/,
    servicenow: /\.service-now\.com/,
  };
  
  let detectedApp: string | undefined;
  for (const [app, pattern] of Object.entries(appPatterns)) {
    if (pattern.test(domain)) {
      detectedApp = app;
      break;
    }
  }
  
  // Load application-specific knowledge
  const appKnowledge = detectedApp
    ? await loadApplicationKnowledge(detectedApp, getTenantId())
    : null;
  
  return {
    url,
    domain,
    applicationType: detectApplicationType(domain),
    requiresAuth: await checkAuthRequired(url),
    detectedApp,
    appKnowledge,
  };
}
```

#### 3.7.2 Dynamic Knowledge Retrieval

**Context-Aware RAG Queries:**
```typescript
async function getContextualKnowledge(
  pageContext: PageContext,
  userQuery: string,
  currentDOM: string
): Promise<RAGContext> {
  // Build query with context
  const enhancedQuery = `
    Application: ${pageContext.detectedApp || 'Unknown'}
    Current Page: ${extractPageInfo(currentDOM)}
    User Task: ${userQuery}
  `;
  
  // Retrieve relevant knowledge
  const knowledge = await queryRAGSystem({
    query: enhancedQuery,
    filters: {
      // Filter by application if known
      application: pageContext.detectedApp,
      // Filter by domain
      domain: pageContext.domain,
      // Filter by page type
      pageType: extractPageType(currentDOM),
    },
    topK: 10,
  });
  
  return knowledge;
}
```

### 3.8 Security & Compliance in Overlay

#### 3.8.1 Data Leakage Prevention

**Content Filtering:**
```typescript
// Filter sensitive data from DOM before sending to LLM
function sanitizeDOM(dom: string, securityContext: SecurityContext): string {
  // Remove password fields
  dom = dom.replace(/<input[^>]*type=["']password["'][^>]*>.*?<\/input>/gi, '');
  
  // Remove credit card fields
  dom = dom.replace(/<input[^>]*data-cc-field[^>]*>.*?<\/input>/gi, '');
  
  // Remove SSN fields
  dom = dom.replace(/<input[^>]*data-ssn[^>]*>.*?<\/input>/gi, '');
  
  // Remove elements marked as sensitive
  dom = dom.replace(/<[^>]*data-sensitive=["']true["'][^>]*>.*?<\/[^>]*>/gi, '');
  
  return dom;
}
```

**PII Detection & Redaction:**
```typescript
// Detect and redact PII before processing
function redactPII(text: string): string {
  // Email addresses
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  
  // Phone numbers
  text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  // SSN
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  
  // Credit card numbers
  text = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CC]');
  
  return text;
}
```

#### 3.6.2 Audit & Compliance Logging

**Comprehensive Logging:**
```typescript
interface OverlayAuditLog {
  tenantId: string;
  userId: string;
  timestamp: Date;
  eventType: 'dom_access' | 'action_executed' | 'knowledge_queried' | 'pii_detected';
  url: string;
  metadata: {
    elementId?: number;
    actionType?: string;
    query?: string;
    piiType?: string;
    redacted?: boolean;
  };
}

// Log all overlay interactions
async function logOverlayEvent(event: OverlayAuditLog) {
  await auditLog.create(event);
  
  // Real-time alerting for sensitive events
  if (event.eventType === 'pii_detected') {
    await alertSecurityTeam(event);
  }
}
```

### 3.5 DOM Processing Pipeline

DOM processing is a critical component that converts complex web page structures into simplified, token-efficient representations for the backend LLM. **In the Thin Client architecture, DOM processing remains client-side** (extension extracts and simplifies DOM), but the processed DOM is sent to the backend for LLM inference.

#### 3.5.1 Processing Pipeline Overview

The DOM processing pipeline involves multiple stages of transformation and optimization:

**Stage 1: DOM Extraction**
- Content script runs in isolated world on every page
- Has access to page DOM but not page JavaScript
- Executes `getAnnotatedDOM` function
- Recursive traversal of entire document tree
- Each element processed individually
- Text nodes preserved where meaningful
- Attributes captured for analysis

**Stage 2: Element Filtering**
- **Visibility Filtering:** Elements with `display: none`, `visibility: hidden`, `opacity: 0`, or `aria-hidden="true"` excluded
- **Interactivity Detection:** Interactive elements identified by:
  - Tag name (a, input, button, select, textarea)
  - Event handlers (onclick, onmousedown, etc.)
  - Cursor style (pointer)
  - ARIA roles
- **Text Node Handling:** Text nodes preserved if they contain meaningful content; whitespace-only text nodes removed

**Stage 3: Attribute Filtering**
- **Preserved Attributes:** `aria-label`, `data-name`, `name`, `type`, `placeholder`, `value`, `role`, `title`
- **Filtered Attributes:** Style attributes, event handlers, class names, non-essential data attributes

**Stage 4: DOM Simplification**
- Unnecessary nesting removed
- Single-child elements collapsed where possible
- Empty containers removed
- Redundant wrappers eliminated
- Interactive elements assigned unique numeric IDs
- IDs used for action targeting
- IDs stable across DOM updates (via unique selectors)

**Stage 5: HTML Templatization**
- Repeated structural patterns identified (must appear 3+ times, depth >= 3 levels)
- Template hash created from structure signature
- Static values inlined in templates
- Dynamic values parameterized
- Template labels assigned (T1, T2, etc.)
- Template instances replaced with references
- Final optimized string generated

#### 3.5.2 Element Identification System

**Unique ID Assignment:**
- Elements receive numeric IDs during annotation
- IDs correspond to array indices
- IDs used for initial element targeting
- Unique string selectors generated for elements
- Selectors stored as data attributes on elements (`data-spadeworks-node-id`)
- Selectors persist across DOM updates

**Element Location:**
- **Content Script Context:** Elements located via data attributes, query selectors used for finding elements
- **Debugger API Context:** Elements located via Chrome Debugger API, DOM queries executed in page context, Object IDs obtained for manipulation

#### 3.5.3 Token Optimization Strategies

**Reduction Techniques:**
- Structure optimization (remove unnecessary nesting, collapse single-child elements)
- Content optimization (preserve only meaningful text, filter non-essential attributes)
- Templatization (identify repeated patterns, create reusable templates, replace instances with references)

**Token Counting:**
- Token counting for prompts (measured before sending to backend)
- Usage tracking for API calls (from backend response)
- Cost estimation for users

#### 3.5.4 Processing Challenges & Solutions

**Dynamic Content:**
- **Challenge:** Pages with dynamic content change frequently; DOM structure may change between actions
- **Solution:** Re-extract DOM after each action; use persistent selectors for stability; wait periods for page settlement

**Complex Pages:**
- **Challenge:** Some pages have extremely complex DOMs; thousands of elements to process; token limits may be exceeded
- **Solution:** Aggressive filtering of non-essential elements; templatization to reduce repetition; focus on interactive elements only

**Single Page Applications:**
- **Challenge:** SPAs update DOM without page reload; History API navigation changes content; elements may be dynamically inserted
- **Solution:** Re-extraction after each action; wait periods for SPA updates; detection of navigation changes

#### 3.5.5 Performance Considerations

**Processing Speed:**
- Efficient traversal algorithms
- Early exit conditions
- Minimal DOM queries
- Caching where possible

**Memory Usage:**
- Stream processing where possible
- Garbage collection of intermediate structures
- Efficient data structures
- Memory cleanup after processing

**CPU Usage:**
- Batch operations where possible
- Defer non-critical processing
- Efficient algorithms
- Minimize re-computation

#### 3.5.6 Error Handling

**Extraction Errors:**
- Try-catch around extraction
- Fallback to simpler extraction
- Error logging
- User notification

**Processing Errors:**
- Validation at each stage
- Graceful degradation
- Error recovery
- Fallback strategies

**Validation:**
- DOM structure validation
- Element existence verification
- Attribute presence checks
- Type validation

### 3.6 DOM Processing Improvements & Future Enhancements

This section explores open-source solutions and research-backed approaches that could improve the current DOM processing approach for better token efficiency and LLM understanding.

#### 3.6.1 Current Approach

The extension currently uses:
- Custom DOM traversal and annotation
- Visibility and interactivity detection
- Attribute filtering
- HTML templatization for token reduction

#### 3.6.2 Alternative Solutions

**Option 1: Accessibility Tree Extraction (Recommended)**

**Description:** Extract the accessibility tree instead of raw DOM. This provides semantic information that's already optimized for understanding page structure.

**Advantages:**
- Semantic roles and relationships built-in
- Already filtered to meaningful elements
- Includes ARIA labels, names, and states
- Smaller than full DOM
- Better for LLM understanding

**Implementation:**
- Use Chrome DevTools Protocol `Accessibility.getFullAXTree`
- Returns structured AXNode objects
- Includes roles (button, link, input), names, labels, states
- Can filter with `interestingOnly` parameter

**Libraries:**
- Playwright: `page.accessibility.snapshot()`
- Puppeteer: `page.accessibility.snapshot()`
- Chrome DevTools Protocol: `Accessibility.getFullAXTree`

**Considerations:**
- Requires Chrome DevTools Protocol (already using for automation)
- May miss some custom interactive elements
- Need to map back to DOM elements for actions

**Option 2: DOM Downsampling**

**Description:** Apply signal processing techniques to reduce DOM size while preserving hierarchy and semantic information.

**Advantages:**
- Preserves structural relationships
- Maintains semantic information (aria-labels, roles)
- Better than aggressive heuristic truncation
- Lower bandwidth than image-based snapshots

**Considerations:**
- Research-level implementation needed
- May require custom development
- Need to balance reduction vs. information loss

**Option 3: Cordyceps - Snapshot for AI**

**Description:** Library that provides `snapshotForAI()` function for seamless snapshot extraction across iframes, shadow DOM, and nested contexts.

**Advantages:**
- Handles complex page structures
- Cross-context support (iframes, shadow DOM)
- Designed specifically for AI/LLM consumption
- Open source (GitHub: adam-s/cordyceps)

**Considerations:**
- Need to evaluate if it fits Chrome Extension context
- May require adaptation for content script environment
- Check license compatibility

**Option 4: Mozilla Readability (Already in Dependencies)**

**Current Usage:** Already in dependencies (`@mozilla/readability`) but may not be actively used.

**Advantages:**
- Proven library (used by Firefox Reader View)
- Removes non-essential content
- Focuses on main content
- Well-maintained

**Limitations:**
- Designed for article/content extraction
- May remove interactive elements needed for automation
- Not optimized for form/button extraction

**Potential Use:**
- Could be used as preprocessing step
- Extract main content area first
- Then apply interactive element detection

#### 3.6.3 Recommended Approach: Accessibility Tree + Current Approach (Hybrid)

**Best of Both Worlds:**
1. Use Accessibility API to get semantic structure
2. Map back to DOM elements for action execution
3. Combine with current templatization for token efficiency
4. Use accessibility tree as primary source, DOM for targeting

**Advantages:**
- Semantic information from accessibility tree
- Precise targeting via DOM elements
- Token-efficient with templatization
- Better LLM understanding

**Implementation Steps:**
1. Extract accessibility tree via Chrome DevTools Protocol
2. Filter to interactive elements
3. Map accessibility nodes to DOM elements
4. Generate simplified representation
5. Apply templatization

#### 3.6.4 Comparison Matrix

| Solution | Token Reduction | Accuracy | Complexity | Implementation Effort |
|----------|----------------|----------|------------|----------------------|
| Current Approach | Good | Good | Medium | Done |
| Accessibility Tree | Excellent | Excellent | Low | Low |
| DOM Downsampling | Excellent | Good | High | High |
| Cordyceps | Good | Good | Medium | Medium |
| Mozilla Readability | Good | Limited | Low | Low |

#### 3.6.5 Implementation Plan: Vertical Slice Approach

**Implementation Philosophy:**

Each task is a **complete vertical slice** that includes:
- All necessary data structures and types
- Backend/helper logic implementation
- Frontend/UI integration
- End-to-end testing capability
- Immediate runnable, testable state

**No horizontal layering:** We do NOT do "all schema changes" then "all backend" then "all frontend". Instead, each task delivers a complete feature that can be tested immediately.

**Recommended Task Sequence:**

**Task 1: Basic Accessibility Tree Extraction**
- Extract accessibility tree and display raw data in UI for validation
- Fallback to current DOM approach if accessibility extraction fails
- **Deliverable:** Extension that can extract and display accessibility tree

**Task 2: Accessibility Node Filtering**
- Filter accessibility tree to interactive elements only
- Integrate into DOM processing
- **Deliverable:** Extension that uses accessibility tree for element identification

**Task 3: Accessibility-DOM Element Mapping**
- Create reliable bidirectional mapping between accessibility nodes and DOM elements
- **Deliverable:** Extension where actions can target elements via accessibility tree mapping

**Task 4: Hybrid Element Representation**
- Combine accessibility tree and DOM data into unified element representation
- **Deliverable:** Extension using unified hybrid element representation

**Task 5: Accessibility-First Element Selection**
- Prioritize accessibility tree as primary source, use DOM as fallback only
- **Deliverable:** Extension that primarily uses accessibility tree, supplements with DOM

**Tasks 6-10:** Task context classification, task-aware filtering, enhanced templatization, performance optimization, comprehensive error handling. See §3.6.5 for implementation plan details.

**Success Criteria:**
- 50%+ token reduction vs. baseline
- Improved or maintained accuracy
- < 200ms processing time
- 99%+ reliability
- Production-ready system

**When to Stop:**
- Stop after Task 3 if token reduction goals met and accuracy maintained
- Stop after Task 5 if hybrid approach working well and token reduction sufficient
- Continue to Task 10 if maximum optimization needed and production-ready polish required

---

## 4. Infrastructure Requirements

### 4.1 Backend Infrastructure

#### 4.1.1 API Server Architecture

**Technology Stack:**
- **Runtime:** Node.js 20+ (TypeScript)
- **Framework:** Next.js (App Router)
- **Database:** **MongoDB** (Mongoose ODM for all persistence except Better Auth)
- **Auth:** **Better Auth** (Prisma) — users, sessions, accounts managed by Prisma only
- **Vector DB:** **MongoDB Atlas Vector Search** (primary) or Pinecone/Weaviate (enterprise)
- **Cache:** Redis 7+ for session management and caching
- **Queue:** Bull/BullMQ for background jobs
- **Storage:** AWS S3, Azure Blob Storage, or GCS for document storage
- **Search:** MongoDB Atlas Search or Elasticsearch (optional)

**API Architecture:**
```
API Gateway (Kong/AWS API Gateway)
  ├── Authentication Service
  │   ├── SSO/SAML Handler
  │   ├── JWT Issuer/Validator
  │   └── Session Manager
  ├── Tenant Service
  │   ├── Tenant Context Middleware
  │   ├── Domain Allowlist Manager
  │   └── Subscription Manager
  ├── RAG Service
  │   ├── Document Ingestion API
  │   ├── Embedding Generator
  │   ├── Vector Search API
  │   └── Knowledge Base Manager
  ├── Task Service
  │   ├── Task Execution API
  │   ├── Action History API
  │   └── Analytics API
  └── Audit Service
      ├── Audit Log API
      └── Compliance Export API
```

#### 4.1.2 Database Architecture

**MongoDB Setup:**
```typescript
// MongoDB connection (Mongoose)
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI, {
  // Connection pool settings
  maxPoolSize: 100, // Maximum number of connections
  minPoolSize: 10,
  // Replica set for high availability
  // Read preference for read replicas
  readPreference: 'secondaryPreferred', // Prefer read replicas
});

// MongoDB Atlas Vector Search index creation (via Atlas UI or CLI)
// RAG implementation is server-side. See `THIN_SERVER_ROADMAP.md` and `SERVER_SIDE_AGENT_ARCH.md` for index configuration and RAG architecture.

// Backup strategy (MongoDB Atlas)
// - Continuous backups (point-in-time recovery)
// - Daily snapshots
// - Cross-region replication for DR
```

**Database Scaling:**
- **Read Replicas:** MongoDB replica set with 2-3 secondary nodes for query load distribution
- **Sharding:** Shard by `tenantId` for very large deployments (MongoDB sharded cluster)
- **Indexing:** Compound indexes on `tenantId` + other fields for efficient queries
- **TTL Indexes:** Optional TTL indexes on `auditLogs`, `taskHistory` for automatic archival

#### 4.1.3 Vector Database Options

**Option 1: MongoDB Atlas Vector Search (Recommended)**
- Integrated with MongoDB (same database as application data)
- Multi-tenant isolation via `tenantId` field
- Cost-effective for <100K chunks per tenant
- Create vector search index via MongoDB Atlas UI or CLI

**Option 2: Pinecone (Managed)**
- Fully managed service
- Better for >100K chunks
- Namespace-based tenant isolation (e.g. `tenant_{tenantId}`)
- Higher cost but better scalability
- Store chunk metadata in MongoDB; embeddings in Pinecone

**Option 3: Weaviate (Self-Hosted or Managed)**
- Open-source option
- Multi-tenancy via classes/collections
- Good for hybrid search (vector + keyword)
- Store chunk metadata in MongoDB; embeddings in Weaviate

### 4.2 Extension Infrastructure

#### 4.2.1 Extension Architecture Updates

**New Components:**
```
src/
├── enterprise/
│   ├── auth/
│   │   ├── ssoHandler.ts
│   │   ├── tokenManager.ts
│   │   └── sessionManager.ts
│   ├── security/
│   │   ├── domainValidator.ts
│   │   ├── permissionChecker.ts
│   │   └── auditLogger.ts
│   ├── rag/
│   │   ├── ragClient.ts
│   │   ├── knowledgeRetriever.ts
│   │   └── contextBuilder.ts
│   └── overlay/
│       ├── overlayUI.tsx
│       ├── tooltipManager.ts
│       └── guidancePanel.tsx
```

**State Management Updates:**
```typescript
// New state slices
interface EnterpriseStore {
  auth: AuthSlice; // SSO, tokens, session
  security: SecuritySlice; // Permissions, domain allowlist
  knowledge: KnowledgeSlice; // RAG context, citations
  overlay: OverlaySlice; // UI state, tooltips
}
```

#### 4.2.2 Communication Protocol

**API Client:**
```typescript
class EnterpriseAPIClient {
  private baseURL: string;
  private authToken: string;
  
  async queryRAG(query: string, options: RAGOptions): Promise<RAGResponse> {
    return this.request('/api/v1/rag/query', {
      method: 'POST',
      body: { query, ...options },
    });
  }
  
  async uploadDocument(file: File): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.request('/api/v1/knowledge/upload', {
      method: 'POST',
      body: formData,
    });
  }
  
  async validateDomain(domain: string): Promise<boolean> {
    const response = await this.request('/api/v1/security/validate-domain', {
      method: 'POST',
      body: { domain },
    });
    return response.allowed;
  }
}
```

### 4.3 Deployment Architecture

#### 4.3.1 Cloud Infrastructure

**AWS Architecture:**
```
┌─────────────────────────────────────┐
│  CloudFront (CDN)                   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  API Gateway / ALB                   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────────┐    ┌───────▼──────┐
│  ECS Fargate│    │  ECS Fargate │
│  (API)      │    │  (Workers)   │
└───┬────────┘    └───────┬──────┘
    │                     │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  RDS PostgreSQL     │
    │  (Multi-AZ)          │
    └──────────┬───────────┘
               │
    ┌──────────▼──────────┐
    │  ElastiCache Redis   │
    └─────────────────────┘

┌─────────────────────────────────────┐
│  S3 (Document Storage)              │
│  - Encrypted (SSE-KMS)              │
│  - Versioned                        │
└─────────────────────────────────────┘
```

**Azure Architecture:**
- Azure App Service for API
- Azure Functions for background jobs
- MongoDB Atlas (with Vector Search)
- Azure Cache for Redis
- Azure Blob Storage for documents
- Azure Key Vault for secrets

**GCP Architecture:**
- Cloud Run for API
- Cloud Functions for background jobs
- MongoDB Atlas or self-hosted MongoDB
- Memorystore for Redis
- Cloud Storage for documents
- Secret Manager for secrets

#### 4.3.2 Containerization

**Docker Configuration:**
```dockerfile
# API Server
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]

# Background Workers
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["node", "dist/workers/index.js"]
```

**Kubernetes Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: api
        image: spadeworks/api:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### 4.4 Monitoring & Observability

#### 4.4.1 Logging

**Structured Logging:**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.json(),
  defaultMeta: {
    service: 'spadeworks-api',
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
  ],
});

// Log with tenant context
logger.info('Task started', {
  tenantId: req.tenantContext.tenantId,
  userId: req.user.id,
  taskId: task.id,
});
```

**Log Aggregation:**
- CloudWatch Logs (AWS)
- Azure Monitor (Azure)
- Cloud Logging (GCP)
- Or: Datadog, New Relic, Splunk

#### 4.4.2 Metrics

**Key Metrics:**
- API request rate (per tenant)
- API latency (p50, p95, p99)
- Task execution success rate
- RAG query latency
- Vector search performance
- Database query performance
- Token usage (per tenant, per user)
- Error rates by type

**Metrics Collection:**
- Prometheus + Grafana
- CloudWatch Metrics (AWS)
- Azure Monitor Metrics
- Datadog APM

#### 4.4.3 Tracing

**Distributed Tracing:**
- OpenTelemetry for instrumentation
- Jaeger or Zipkin for trace visualization
- Trace all requests across services
- Track tenant context in traces

### 4.5 Security Infrastructure

#### 4.5.1 Network Security

**Network Isolation:**
- VPC with private subnets for databases
- Public subnets only for load balancers
- Security groups with least privilege
- WAF (Web Application Firewall) for API protection

**DDoS Protection:**
- CloudFlare or AWS Shield
- Rate limiting at API gateway
- Per-tenant rate limits

#### 4.5.2 Secrets Management

**Secrets Storage:**
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault
- Kubernetes Secrets (encrypted at rest)

**Key Rotation:**
- Automated key rotation policies
- Support for key versioning
- Zero-downtime rotation

---

## 5. Migration Path from Current Architecture

### 5.1 Phase 1: Foundation (Months 1-2)

**Backend Infrastructure:**
1. Set up MongoDB database (MongoDB Atlas or self-hosted) with Mongoose
2. Create MongoDB Atlas Vector Search index (or configure Pinecone/Weaviate)
3. Configure Better Auth with Prisma (users, sessions, accounts)
4. Create Mongoose schemas (Tenant, AllowedDomain) for tenant isolation
5. Create Next.js API server (App Router) with authentication
6. Implement SSO/SAML integration (one provider initially) via Better Auth
7. Set up basic RBAC system (Role, UserRole Mongoose schemas)

**Extension Updates:**
1. Add enterprise authentication flow
2. Implement tenant context in extension
3. Add domain allowlist validation
4. Update state management for enterprise features

**Deliverables:**
- Multi-tenant database schema
- Basic API server with auth
- Extension with SSO login
- Domain allowlist enforcement

### 5.2 Phase 2: RAG Pipeline (Months 3-4)

**RAG Implementation:**
1. Document ingestion pipeline
2. Text extraction for PDF, DOCX, Markdown
3. Chunking strategy implementation
4. Embedding generation and storage
5. Vector similarity search
6. RAG query API

**Extension Integration:**
1. RAG client in extension
2. Enhanced prompt with RAG context
3. Citation display in UI
4. Knowledge base management UI

**Deliverables:**
- Document upload and processing
- Vector search API
- RAG-enhanced LLM prompts
- Knowledge base UI

### 5.3 Phase 3: Overlay & Security (Months 5-6)

**Overlay Implementation:**
1. Contextual tooltip system
2. Inline guidance components
3. Real-time context detection
4. URL-based context switching

**Security Enhancements:**
1. Element-level access control
2. PII detection and redaction
3. Comprehensive audit logging
4. Compliance export features

**Deliverables:**
- Overlay UI components
- Security validation pipeline
- Audit logging system
- Compliance features

### 5.4 Phase 4: Scale & Polish (Months 7-8)

**Scaling:**
1. Database read replicas
2. Caching layer (Redis)
3. Background job queue
4. Performance optimization

**Enterprise Features:**
1. Advanced analytics dashboard
2. Custom action support
3. Workflow templates
4. Advanced RBAC features

**Deliverables:**
- Scalable infrastructure
- Enterprise admin dashboard
- Advanced features
- Production-ready platform

### 5.5 Migration Strategy

**Data Migration:**
- Current extension users can migrate to enterprise accounts
- Export/import functionality for user data
- Gradual migration path with dual-mode support

**Backward Compatibility:**
- Maintain consumer extension alongside enterprise
- Shared codebase with feature flags
- Gradual deprecation of consumer features

### 5.6 Migration Checklist

**Phase 1: Foundation**
- [ ] Set up MongoDB (MongoDB Atlas or self-hosted)
- [ ] Create MongoDB Atlas Vector Search index (or configure Pinecone/Weaviate)
- [ ] Configure Better Auth with Prisma
- [ ] Create Mongoose schemas (Tenant, AllowedDomain, KnowledgeDocument, KnowledgeChunk, Task, TaskAction)
- [ ] Implement tenant isolation via `tenantId` field (all queries filter by tenantId)
- [ ] Create Next.js API server (App Router)
- [ ] Configure Better Auth with Prisma (SSO/SAML via Better Auth)
- [ ] JWT token management handled by Better Auth
- [ ] Update extension for enterprise auth

**Phase 2: RAG Pipeline**
- [ ] Document upload API
- [ ] Text extraction (PDF, DOCX, Markdown)
- [ ] Chunking strategy
- [ ] Embedding generation
- [ ] Vector storage (MongoDB Atlas Vector Search or Pinecone/Weaviate)
- [ ] Similarity search API
- [ ] RAG client in extension
- [ ] Enhanced prompts with RAG context

**Phase 3: Security & Overlay**
- [ ] Domain allowlist validation
- [ ] Element-level access control
- [ ] PII detection and redaction
- [ ] Audit logging system
- [ ] Overlay UI components
- [ ] Contextual tooltips
- [ ] Real-time context detection

**Phase 4: Scale & Polish**
- [ ] Database read replicas
- [ ] Redis caching layer
- [ ] Background job queue
- [ ] Performance optimization
- [ ] Monitoring and observability
- [ ] Compliance features (GDPR, SOC 2)

### 5.7 Extension Thin Client Migration

This section details the refactoring steps to migrate the browser extension from **client-side inference** (extension calls OpenAI directly) to a **Thin Client** architecture. The extension becomes a pure **Action Runner**: it captures DOM/events, sends them to the backend, receives `NextActionResponse` or `ResolveKnowledgeResponse`, and either executes the returned action or displays knowledge context. All LLM calls, prompt construction, RAG retrieval, and action-history context live on the server.

#### 5.7.1 Migration Goals

- **Remove** all local inference logic: OpenAI API keys, prompt construction, local LLM calls.
- **Implement** a pure Action Runner: capture DOM → transmit to backend → execute `NextActionResponse` or display `ResolveKnowledgeResponse`.
- **Preserve** existing DOM extraction, simplification, templatization, and Chrome Debugger–based action execution.
- **Add** authenticated API client (Bearer token), task/session handling, and optional overlay for knowledge display.

#### 5.7.2 Current vs Target Architecture

**Current (Client-Side Inference):**
```
User instructions → TaskUI
  → runTask (currentTask)
    → getSimplifiedDom (content script + simplifyDom + templatize)
    → determineNextAction(instructions, history, dom)
      → OpenAI SDK (browser), prompt built in extension
      → LLM returns <Thought>...</Thought><Action>...</Action>
    → parseResponse(response) → ParsedResponse
    → append to currentTask.history (client-held action history)
    → callDOMAction(click | setValue) or finish/fail
    → loop until finish/fail/error/interrupt
```

- **API key:** Stored in extension (`settings.openAIKey`), passed to OpenAI.
- **Model:** `settings.selectedModel`; extension calls OpenAI with it.
- **History:** `currentTask.history` (prompt, response, action, usage); used to build next prompt.
- **Knowledge:** None today.

**Target (Thin Client / Action Runner):**
```
User instructions → TaskUI
  → runTask (currentTask)
    → getSimplifiedDom + templatize (unchanged)
    → get active tab URL
    → POST /api/agent/interact { url, query, dom, taskId? }
      → Auth: Bearer <accessToken>
      → Server: RAG + LLM, returns NextActionResponse { thought, action, usage? }
    → (no parseResponse; server returns structured JSON)
    → append { thought, action, usage? } to display-only history (optional)
    → execute action: click/setValue via callDOMAction, or handle finish/fail
    → loop until finish/fail/error/interrupt
```

- **API key:** **Removed.** Auth via `accessToken` (login); extension sends `Authorization: Bearer <accessToken>`.
- **Model:** **Removed** from extension. Server chooses model per tenant/config.
- **History:** **Server-owned.** Client sends `taskId` with each `/interact`; server stores and uses action history for context. Extension may keep a **display-only** list of `{ thought, action }` for TaskHistory UI.
- **Knowledge:** Optional. `GET /api/knowledge/resolve?url=...&query=...` → `ResolveKnowledgeResponse`; extension displays `context` + `citations` in overlay/tooltips.

#### 5.7.3 Refactoring Steps

**5.7.3.1 Remove Local Inference Logic**

| Item | Action |
|------|--------|
| **OpenAI SDK** | Remove `openai` and `openpipe` imports; delete `determineNextAction.ts` usage. Optionally remove packages from `package.json` once no other code uses them. |
| **Prompt construction** | Delete `formatPrompt` and any extension-side prompt building. Server builds prompts. |
| **`determineNextAction`** | Remove. Replace with `agentInteract()` that calls `POST /api/agent/interact` (see below). |
| **`parseResponse`** | **Keep** only for backward compatibility during migration **or** remove entirely. Server returns `NextActionResponse` (structured JSON); no `<Thought>`/`<Action>` parsing in extension. |
| **API key storage** | Remove `settings.openAIKey`, `settings.openPipeKey`. Remove SetAPIKey UI and any persistence of keys. |
| **Model selection** | Remove `settings.selectedModel` and ModelDropdown (or retain as **display-only** if server echoes model in response). |

**5.7.3.2 Authentication & API Client**

- **Login:** Implement login flow (e.g. `POST /api/v1/auth/login` with email/password). Store `accessToken` and optionally `expiresAt`, `user`, `tenantId` in `chrome.storage.local`. Prefer encrypted storage if available.
- **Session check:** On startup, call `GET /api/v1/auth/session`. If 401, show login UI; do not allow running tasks.
- **API client:** Add a small module (e.g. `apiClient.ts`) that:
  - Base URL: configurable (env or build-time) pointing at Next.js backend.
  - Sets `Authorization: Bearer <accessToken>` and `Content-Type: application/json` for JSON requests.
  - Handles 401 (redirect to login), 403 (e.g. domain not allowed), and network errors.

**5.7.3.3 Agent Interact (Action Loop)**

- **Endpoint:** `POST /api/agent/interact` (or `POST /api/v1/agent/interact`; align with server).
- **Request:**
  - `url`: active tab URL (string).
  - `query`: user task instructions (string).
  - `dom`: simplified, templatized DOM string (output of current pipeline).
  - `taskId`: optional. If provided, server associates request with existing task and uses stored action history. If omitted, server creates a new task and returns `taskId` in response (extension stores it for subsequent calls in same run).
- **Response:** `NextActionResponse`:
  - `thought: string`
  - `action: string` (e.g. `click(123)`, `setValue(123, "x")`, `finish()`, `fail()`)
  - `usage?: { promptTokens: number; completionTokens: number }`
  - `taskId?: string` (if server creates task; client should send this on later steps).

**Flow:**

1. User starts task → extension gets simplified DOM, active tab `url`, `query` (instructions).
2. First request: no `taskId`. Server creates task, returns `NextActionResponse` + `taskId`.
3. Extension stores `taskId`. Executes action (click/setValue) or handles finish/fail.
4. Next iteration: get updated DOM (after action + optional 2s wait). `POST /api/agent/interact` with same `taskId`, `url`, `query`, new `dom`. Server uses stored action history for context, returns next `NextActionResponse`.
5. Repeat until `action` is `finish()` or `fail()`, or error/interrupt.

**5.7.3.4 Action Execution (Unchanged)**

- Keep **`availableActions`**, **`parseResponse`**-compatible handling only for **interpreting** `NextActionResponse.action` (e.g. `click(123)` → `callDOMAction('click', { elementId: 123 })`). Alternatively, add a small helper that parses `action` string and maps to `callDOMAction` without full `parseResponse`.
- Keep **`callDOMAction`**, **Chrome Debugger** attachment, **ripple**, and **disableExtensions** behavior as today. No change to **`domActions`** or **`pageRPC`** for execution.

**5.7.3.5 Knowledge Resolve (Optional)**

- **Endpoint:** `GET /api/knowledge/resolve?url=...&query=...` (see `SERVER_SIDE_AGENT_ARCH.md`).
- **Request:** `url` (required), `query` (optional). Auth: Bearer.
- **Response:** `ResolveKnowledgeResponse`:
  - `allowed: true`
  - `domain: string`
  - `context: Array<{ id, content, documentTitle, metadata? }>`
  - `citations?: Array<{ documentId, documentTitle, section?, page? }>`

**Usage:**

- Call when user focuses a tab or opens overlay (e.g. on url change). Use `context` + `citations` for tooltips, "Learn more" bubbles, or side panel. Do **not** use for inference; inference is server-only.

**5.7.3.6 Action History: Client vs Server**

- **Server:** Holds **canonical** action history per `taskId`. Used for prompt context on each `/interact`.
- **Client:** Keeps a **display-only** history for TaskHistory UI:
  - Each `/interact` returns `{ thought, action, usage? }`. Append to a `displayHistory` array in task state.
  - TaskHistory component renders `displayHistory` (thought, action string, optional usage). No need to store prompt/response.
- **Persistence:** Do not persist action history to `localStorage` across sessions. It is task-scoped and can be discarded when task ends. Optionally, allow "copy history" for debugging.

**5.7.3.7 State Management Updates**

- **Store slices:**
  - **`currentTask`:** Keep `tabId`, `instructions`, `status`, `actionStatus`, `runTask`, `interrupt`. Replace `history` with `displayHistory: Array<{ thought, action, usage? }>`. Add `taskId: string | null` when using server-owned tasks.
  - **`settings`:** Remove `openAIKey`, `openPipeKey`, `selectedModel`. Add auth-related state only if not stored solely in `chrome.storage` (e.g. `user`, `tenantId` for UI).
  - **`ui`:** Keep `instructions` and related UI state.
- **Persistence:** Stop persisting API keys. Persist `accessToken` (or similar) only in extension storage, not in Zustand persist middleware, if you use it.

**5.7.3.8 UI Changes**

- **SetAPIKey:** Remove. Replace with **Login** UI (email/password → `POST /api/v1/auth/login`), then store token.
- **ModelDropdown:** Remove or repurpose as display-only (e.g. "Model: server-configured").
- **TaskUI:** Same overall flow (instructions, Run, TaskHistory). Ensure `runTask` uses `agentInteract` and `displayHistory`.
- **TaskHistory:** Render `displayHistory` (thought, action, usage). Remove copy of raw prompt/response if you only need thought/action for UX.
- **TokenCount:** If shown, use `usage` from `NextActionResponse` when provided.
- **Overlay (new):** Optional. When knowledge resolve is used, show `context`/`citations` in tooltips or a small overlay panel.

**5.7.3.9 Config / Environment**

- **Backend base URL:** e.g. `NEXT_PUBLIC_API_BASE` or `API_BASE` in `.env`, injected at build time. API client uses it for `/api/agent/interact` and `/api/knowledge/resolve`.
- **CORS:** Backend must allow extension origin (`chrome-extension://<id>`). Extension uses `credentials: 'omit'` and Bearer token; no cookies required.

#### 5.7.4 Request / Response Schemas (Extension Side)

**POST /api/agent/interact**

**Request body:**
```typescript
interface AgentInteractRequest {
  url: string;
  query: string;
  dom: string;
  taskId?: string | null;
}
```

**Response (200):**
```typescript
interface NextActionResponse {
  thought: string;
  action: string;
  usage?: { promptTokens: number; completionTokens: number };
  taskId?: string;
}
```

**Errors:** 400 (validation), 401 (unauthorized), 403 (e.g. domain not allowed), 404, 500. Handle via API client and surface in UI (e.g. toast).

**GET /api/knowledge/resolve**

**Query params:** `url` (required), `query` (optional).

**Response (200):**
```typescript
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
  context: KnowledgeChunk[];
  citations?: Citation[];
}
```

**Errors:** 401, 403 (e.g. `DOMAIN_NOT_ALLOWED`), 404, 500.

#### 5.7.5 Files to Modify / Add / Remove

| File | Action |
|------|--------|
| `src/helpers/determineNextAction.ts` | **Remove** |
| `src/helpers/parseResponse.ts` | **Keep** only if used to map `NextActionResponse.action` to `callDOMAction`; otherwise simplify to a small action-string parser. |
| `src/state/settings.ts` | Remove `openAIKey`, `openPipeKey`, `selectedModel`. Add auth-related fields only if needed in UI. |
| `src/state/currentTask.ts` | Refactor `runTask` to use `agentInteract`; add `taskId`, `displayHistory`; remove client-held prompt/response history. |
| `src/state/store.ts` | Update `partialize` (no keys); adjust slices as above. |
| `src/common/SetAPIKey.tsx` | **Remove** or replace with Login UI. |
| `src/common/ModelDropdown.tsx` | **Remove** or make display-only. |
| `src/common/App.tsx` | Drop SetAPIKey/ModelDropdown usage; add Login when unauthenticated. |
| `src/common/TaskUI.tsx` | Minimal changes if runTask/history interface preserved. |
| `src/common/TaskHistory.tsx` | Switch to `displayHistory`; render thought, action, usage. |
| `src/common/TokenCount.tsx` | Use `usage` from `NextActionResponse` when available. |
| `src/helpers/pageRPC.ts`, `simplifyDom`, `domActions`, `chromeDebugger` | **Keep**; no inference-related changes. |
| `src/helpers/availableActions.ts` | **Keep** for action execution. |
| **New** `src/api/client.ts` (or equivalent) | API client + `agentInteract`, optional `knowledgeResolve`. |
| **New** `src/api/types.ts` | `NextActionResponse`, `ResolveKnowledgeResponse`, request types. |

#### 5.7.6 Extension Migration Summary

The extension is refactored into a **Thin Client** that:

1. **Captures** DOM (existing pipeline) and active tab URL.
2. **Transmits** `url`, `query`, `dom`, and optionally `taskId` to `POST /api/agent/interact`.
3. **Receives** `NextActionResponse` and either **executes** the action (click/setValue) or handles **finish**/ **fail**.
4. **Optionally** calls `GET /api/knowledge/resolve` and **displays** `ResolveKnowledgeResponse` in overlay/tooltips.
5. **Relies** on the server for inference, RAG, and action-history context; uses **Bearer token** auth and **no** local API keys or LLM calls.

---

## 6. Implementation Roadmap

### 6.1 Development Priorities

**Critical Path:**
1. Multi-tenant database schema
2. SSO authentication
3. RAG pipeline (document ingestion → vector search)
4. Extension integration with backend API
5. Security and compliance features

**Nice-to-Have (Post-MVP):**
- Advanced analytics
- Custom actions
- Workflow templates
- Multi-language support
- Mobile app support

### 6.2 Technical Debt & Risks

**Technical Debt:**
- Current extension uses localStorage - needs migration to encrypted storage
- No backend currently - requires full backend implementation
- Single-tenant architecture - needs complete refactor

**Risks:**
- Vector database performance at scale
- SSO integration complexity
- Security vulnerabilities in overlay
- Compliance requirements (GDPR, SOC 2, HIPAA)

### 6.3 Key Technical Decisions

**1. Vector Database Choice**
- **Decision:** MongoDB Atlas Vector Search (primary), Pinecone (enterprise scale)
- **Rationale:** Integrated with MongoDB (same database as application data), cost-effective, multi-tenant friendly via `tenantId` field

**2. Tenant Isolation Strategy**
- **Decision:** Schema-level isolation (primary), RLS (alternative)
- **Rationale:** Strongest isolation, easier to reason about, better performance

**3. Authentication Flow**
- **Decision:** SSO/SAML with JWT tokens
- **Rationale:** Enterprise standard, supports major providers, secure

**4. Overlay Injection**
- **Decision:** Content script with Shadow DOM
- **Rationale:** Style isolation, non-intrusive, works across origins

**5. API Architecture**
- **Decision:** RESTful API with GraphQL for complex queries (optional)
- **Rationale:** Simple, well-understood, easy to integrate

### 6.4 Success Metrics

**Technical Metrics:**
- API latency: <200ms (p95)
- Vector search latency: <100ms (p95)
- Task success rate: >90%
- Uptime: 99.9%

**Business Metrics:**
- Tenant onboarding time: <1 week
- Document processing time: <5 minutes per document
- User adoption rate: >70% of licensed users
- Customer satisfaction: NPS >50

---

## Appendix A: API Specifications

### A.1 Authentication API

**POST /api/v1/auth/sso/initiate**
```json
{
  "tenantId": "uuid",
  "provider": "okta" | "azure_ad" | "google" | "saml"
}
```

**POST /api/v1/auth/sso/callback**
```json
{
  "tenantId": "uuid",
  "samlResponse": "base64-encoded-saml-assertion"
}
```

**Response:**
```json
{
  "token": "jwt-token",
  "refreshToken": "refresh-token",
  "expiresIn": 3600,
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "role": "user"
  }
}
```

### A.2 RAG API

**POST /api/v1/rag/query**
```json
{
  "query": "How do I submit an expense report?",
  "url": "https://app.company.com/expenses",
  "topK": 5,
  "filters": {
    "categories": ["hr", "finance"],
    "tags": ["expenses"]
  }
}
```

**Response:**
```json
{
  "chunks": [
    {
      "id": "uuid",
      "content": "To submit an expense report...",
      "documentTitle": "Expense Policy 2024",
      "similarity": 0.92,
      "metadata": {
        "page": 5,
        "section": "Submission Process"
      }
    }
  ],
  "queryEmbedding": [0.123, ...],
  "totalChunks": 5
}
```

**POST /api/v1/knowledge/upload**
```json
{
  "file": "multipart/form-data",
  "title": "Expense Policy 2024",
  "category": "finance",
  "tags": ["expenses", "policy"]
}
```

### A.3 Task API

**POST /api/v1/tasks/start**
```json
{
  "instructions": "Submit an expense report for $50 lunch",
  "url": "https://app.company.com/expenses"
}
```

**GET /api/v1/tasks/{taskId}/history**
```json
{
  "task": {
    "id": "uuid",
    "status": "running",
    "actionCount": 5
  },
  "actions": [
    {
      "index": 1,
      "type": "click",
      "thought": "I need to click the new expense button",
      "executedAt": "2026-01-25T10:00:00Z"
    }
  ]
}
```

---

## Appendix B: Database Schema Diagrams

[Schema diagrams would be included here in production document]

---

## Appendix C: Security Threat Model

### C.1 Threat Analysis

**Threats:**
1. **Data Leakage:** Tenant data accessed by unauthorized users
2. **SSO Bypass:** Authentication bypassed via token manipulation
3. **DOM Injection:** Malicious code injected via overlay
4. **PII Exposure:** Sensitive data sent to LLM API
5. **Rate Limit Bypass:** API abuse via excessive requests

**Mitigations:**
- Tenant isolation at database level
- JWT token validation with signature verification
- Content Security Policy in extension
- PII detection and redaction
- Per-tenant rate limiting

---

## Conclusion

This specification provides a comprehensive blueprint for evolving Spadeworks Copilot AI into a commercial B2B enterprise platform. The three core pillars—Multi-Tenant Architecture & Security, Private Knowledge Injection (RAG), and Contextual Overlay Mechanics—form the foundation for a scalable, secure, and intelligent platform that enables organizations to overlay AI assistance onto their existing workflows.

The implementation roadmap provides a phased approach to building this platform, with clear milestones and deliverables. Success depends on careful execution of the security architecture, robust RAG pipeline implementation, and seamless overlay mechanics that respect corporate security boundaries.

---

## 7. Next Steps

1. **Architecture Review:** Validate technical approach with team
2. **Resource Planning:** Estimate development effort and timeline
3. **POC Development:** Build minimal viable version of each pillar
4. **Security Review:** External security audit of architecture
5. **Pilot Program:** Deploy to 2-3 beta enterprise customers

---

**Document Status:** Draft for Review  
**Last Updated:** January 25, 2026  
**Version:** 1.0
