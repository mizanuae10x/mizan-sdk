# ⚖️ Mizan Framework SDK

> **The Compliance-First AI Agent Platform for the Arab World.**  
> Build AI agents with built-in UAE governance, rules enforcement, RAG knowledge bases, and tamper-evident audit trails.

[![npm version](https://img.shields.io/npm/v/@mizan/sdk?color=gold&logo=npm)](https://www.npmjs.com/package/@mizan/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-109%20passing-brightgreen)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](tsconfig.json)
[![UAE Compliance](https://img.shields.io/badge/UAE%20Compliance-PDPL%20%7C%20AI%20Ethics%20%7C%20NESA%20%7C%20Dubai%20AI%20Law-gold)](src/compliance/)

---

## Install

```bash
npm install @mizan/sdk
```

## Quick Setup

```bash
cp node_modules/@mizan/sdk/.env.example .env   # configure API keys
npx mizan setup                                # interactive wizard
npx mizan doctor                               # verify environment
```

```
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Build your first agent (3 minutes)

```js
const { MizanAgent, webSearchTool, calculatorTool, autoDetectAdapter } = require('@mizan/sdk');

class MyAgent extends MizanAgent {
  async think(input) {
    const news = await this.useTool('web_search', { query: input.topic });
    return `Analysis: ${news.data?.answer || 'No data'}`;
  }
}

const agent = new MyAgent({ adapter: autoDetectAdapter() });
agent.registerTool(webSearchTool).registerTool(calculatorTool);

const result = await agent.run({ topic: 'UAE AI strategy 2031' });
console.log(result.output);
```

---

## Features

### 🇦🇪 UAE AI Governance Compliance (4 Frameworks)

The most complete UAE AI compliance layer available in any SDK:

| Framework | Coverage |
|-----------|----------|
| **PDPL** (Federal Decree-Law No. 45/2021) | Art. 3,4,6,10,14 — consent, data minimisation, residency/transfer checks; Art. 16 sensitive data; Art. 18 breach notification (72h rule) |
| **UAE AI Ethics Principles** | 6 principles — inclusiveness, reliability, transparency, privacy, security, accountability |
| **NESA Controls** | 5 controls — audit/logging integrity, incident management, data classification, access controls, encryption |
| **Dubai AI Law (No. 9/2023)** | Art. 3 prohibited uses (deepfake, social scoring, mass surveillance); Art. 5 DDA registration; Art. 8 transparency disclosure; Art. 10 human oversight; Art. 12 data governance |

```ts
import { UAEComplianceLayer, DubaiAILawChecker } from '@mizan/sdk';

const compliance = new UAEComplianceLayer({
  frameworks: ['PDPL', 'UAE_AI_ETHICS', 'NESA', 'DUBAI_AI_LAW'],
  language: 'both',       // en | ar | both
  auditLevel: 'full',
  dataResidency: 'UAE',
});

const agent = new ComplianceAgent({ adapter: autoDetectAdapter(), compliance });

const response = await agent.run({
  userId: 'U123',
  action: 'loan_application',
  purpose: 'credit_assessment',
  consent: true,
  dataResidency: 'UAE',
  aiDisclosure: true,       // Dubai AI Law Art. 8
  humanReview: true,        // Dubai AI Law Art. 10
  dataGovernance: 'DG-001', // Dubai AI Law Art. 12
});

console.log('Compliance Score:', response.decisions[0].complianceReport?.score);
console.log('Arabic Summary:', response.decisions[0].complianceReport?.summaryAr);
```

**`ComplianceCheck` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `framework` | `UAEFramework` | `PDPL` \| `UAE_AI_ETHICS` \| `NESA` \| `DUBAI_AI_LAW` |
| `article` | `string` | Article/control reference (e.g., `Art. 6`, `AC-01`) |
| `status` | `ComplianceStatus` | `COMPLIANT` \| `NON_COMPLIANT` \| `REVIEW_REQUIRED` |
| `requirement` | `string` | English requirement text |
| `requirementAr` | `string` | Arabic requirement text |
| `passed` | `boolean` | Pass/fail |
| `details` | `string` | Evidence and execution details |
| `remediation` / `remediationAr` | `string` | Remediation guidance (en/ar) |

Full example: [`examples/uae-compliance.ts`](./examples/uae-compliance.ts)

---

### 📋 Rules Engine (Safe Expression Evaluator)

Define business rules using natural expression syntax. The evaluator uses a
**recursive-descent parser** — no `eval()` or `Function()` constructor.

```js
const { RuleEngine, ExpressionEvaluator } = require('@mizan/sdk');

const engine = new RuleEngine();
engine.loadRules([
  { id: 'R1', name: 'Approve',  condition: 'score >= 70 && country === "AE"', action: 'APPROVED', reason: 'Meets threshold', priority: 1 },
  { id: 'R2', name: 'Reject',   condition: 'score < 30',  action: 'REJECTED', reason: 'Too low', priority: 2 },
  { id: 'R3', name: 'Review',   condition: 'score >= 30 && score < 70', action: 'REVIEW', reason: 'Manual review', priority: 3 },
]);

const decision = engine.evaluate({ score: 85, country: 'AE' });
// → { result: 'APPROVED', matchedRule: { id: 'R1', ... }, score: 85 }

// Conflicts detection
const conflicts = engine.detectConflicts();

// Use the evaluator directly
const { evaluateExpression } = require('@mizan/sdk');
const ok = evaluateExpression('user.role === "admin" && amount > 1000', { user: { role: 'admin' }, amount: 5000 });
```

**Supported syntax:** `>`, `>=`, `<`, `<=`, `===`, `==`, `!==`, `!=`, `&&`, `||`, `!`, `()`, string literals (`"` / `'`), number/boolean/null literals, dot notation (`user.role`).

---

### 📊 Audit Trail (Hash-Chain Integrity)

Every decision is logged with SHA-256 chain linking — tamper-evident:

```js
const { AuditLogger } = require('@mizan/sdk');

const logger = new AuditLogger('data/audit.jsonl');
const entry = logger.log(decision, { userId: 'U123', amount: 50000 });
// → { id, timestamp, input, output, rule, previousHash, hash }

logger.verify();        // verify in-memory chain
logger.verifyFull();    // reload from disk and verify from genesis

// After process restart — query without loading into memory:
const logger2 = new AuditLogger('data/audit.jsonl');
const allEntries = logger2.queryFromDisk();
const approvals  = logger2.queryFromDisk({ result: 'APPROVED', startDate: '2026-01-01' });

// Or preload all entries into memory on startup:
const logger3 = new AuditLogger('data/audit.jsonl', /* preload = */ true);
console.log(logger3.size(), 'entries loaded');

logger.exportCSV();     // → CSV string with all entries
```

---

### 📚 RAG Knowledge Base

Add documents to a vector knowledge base and query them with semantic search.
Works offline with hash-based embeddings; switches to OpenAI ada-002 when `OPENAI_API_KEY` is set.

```js
const { RAGEngine } = require('@mizan/sdk');

const rag = new RAGEngine('data/rag-store.json');

// Ingest documents (deduplication by content hash and name)
const result = await rag.ingest('PDPL Guide', 'Federal Decree-Law No. 45 of 2021...');
if (result.duplicate) {
  console.log('Duplicate detected:', result.duplicateType); // 'hash' | 'name'
}

// Force-replace an existing document
await rag.reingest('PDPL Guide', 'Updated content v2...');

// Semantic search
const results = await rag.search('data subject rights UAE', 5);
results.forEach(r => console.log(`${r.chunk.docName} (${r.score.toFixed(2)}): ${r.chunk.text.slice(0, 100)}`));

// Ask a question (RAG answer)
const answer = await rag.ask('What are the penalties under PDPL?');
console.log(answer.answer);
console.log(answer.sources);

// Manage documents
const docs = rag.listDocuments();       // { id, name, chunkCount, contentHash, createdAt }
rag.deleteDocument(docId);
const stats = rag.getStats();           // { documentCount, chunkCount, embeddingModel }

// Lookup helpers
const doc = rag.findByName('PDPL Guide');
const doc2 = rag.findByHash('sha256...');
```

**Embedding models:**
- **`ada-002`** (default when `OPENAI_API_KEY` set) — 1536-dim, OpenAI API
- **`hash-128`** (offline fallback) — 128-dim, deterministic hash-based; no API key needed

Documents are persisted to `rag-store.json` and reload on restart.

---

### 🧠 Session Memory

Persistent conversation history per session, per agent:

```js
const { SessionMemory } = require('@mizan/sdk');

const memory = new SessionMemory('data/sessions.json', /* maxMessages = */ 50);

// Add messages
memory.addMessage('session-abc', 'agent-1', 'user', 'What is PDPL?');
memory.addMessage('session-abc', 'agent-1', 'assistant', 'Federal Decree-Law No. 45/2021...');

// Retrieve history (returns LLM-ready message array)
const history = memory.getHistory('session-abc');
// → [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]

// List all sessions for an agent
const sessions = memory.listSessions('agent-1');
// → [{ id, agentId, messageCount, createdAt, updatedAt, metadata }]

// Store metadata on session
memory.setMetadata('session-abc', 'language', 'ar');

memory.clearSession('session-abc');
```

Sessions are saved to disk and survive process restarts.

---

### 📡 Webhook Triggers

Register HTTP webhooks that fire on agent decisions:

```js
const { MizanAgent } = require('@mizan/sdk');

const agent = new MyAgent({ ... });

// Register a webhook
const wh = agent.addWebhook({
  url: 'https://n8n.example.com/webhook/agent-decision',
  events: ['APPROVED', 'REJECTED'],
  secret: 'wh-secret-123',   // HMAC-SHA256 signing (optional)
});

// Webhook payload on trigger:
// { event: 'APPROVED', decision: { ... }, timestamp: '...', agent: 'agent-id' }
```

Webhooks can also be configured via the Studio UI (Webhooks page).

---

### 🤝 Multi-Agent Orchestration

Chain agents sequentially or run them in parallel:

```js
const { Orchestrator } = require('@mizan/sdk');

const orchestrator = new Orchestrator();

// Sequential chain — output of A feeds input to B
orchestrator.addAgent('compliance-checker', complianceAgent);
orchestrator.addAgent('decision-writer',    writerAgent);

const result = await orchestrator.runChain('compliance-checker', input, {
  next: 'decision-writer',
  passFields: ['complianceReport', 'decision'],
});

// Parallel execution
const results = await orchestrator.runParallel(
  ['agent-a', 'agent-b', 'agent-c'],
  input
);
```

---

### 🔧 Tool System

```js
agent.registerTool(webSearchTool)
     .registerTool(calculatorTool)   // safe math — no eval/Function()
     .registerTool(dateTimeTool)
     .registerTool(httpTool)
     .registerTool(fileReaderTool);

// Export to LLM function-calling formats
const openAIFunctions = agent.tools.toOpenAIFunctions();
const anthropicTools  = agent.tools.toAnthropicTools();
```

Built-in tools: `web_search`, `calculate`, `get_datetime`, `http_request`, `read_file`.

---

### 📡 Streaming

```js
await agent.runStream(
  { topic: 'AI governance' },
  (chunk)    => process.stdout.write(chunk),
  (response) => console.log('\nDone:', response.decisions)
);
```

---

## 🎛️ Mizan Studio

A visual governance dashboard bundled with the SDK. Run it locally:

```bash
npm run build            # compile TypeScript
node studio/server.js    # start Studio on port 4000
```

Then open `http://localhost:4000`.

### First-Run Setup

On first launch, Studio shows the **Admin Setup Wizard** — create your admin account (name, email, password ≥ 8 chars, studio name, language). All subsequent visits require login.

### Auth System

- **Login**: `http://localhost:4000/login.html` — email + password
- **Session tokens**: 32-byte random hex, 24h expiry, stored in `data/studio-sessions.json`
- **Password storage**: SHA-256 + salt (`data/auth.json`) — no external auth library
- **All API routes** protected with `requireStudioAuth` middleware (except `/api/auth/*` and public agent chat)
- **Rate limits**: 10 login attempts per 15 min per IP; 120 API requests per minute per IP
- **CORS**: restricted to `localhost:4000` by default; override with `STUDIO_ALLOWED_ORIGINS=https://yourdomain.com`

### Studio Pages (13 total)

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Activity feed, stats, quick actions |
| Rules | `/rules.html` | Create, edit, prioritize rules |
| Decide | `/decide.html` | Test rules against live facts |
| Audit | `/audit.html` | Browse and verify audit trail |
| Agents | `/agents.html` | Create agents, deploy, manage API keys |
| Setup | `/setup.html` | Environment, API keys, adapters |
| Compliance | `/compliance.html` | UAE compliance scanner (4 frameworks) |
| Knowledge Base | `/rag.html` | Upload documents, query KB, chat |
| Widget | `/widget-demo.html` | Embeddable chat widget preview & install code |
| Webhooks | `/webhooks.html` | Register and test webhook endpoints |
| Orchestration | `/orchestration.html` | Build and run multi-agent pipelines |
| Login | `/login.html` | Authentication |
| First Run | `/first-run.html` | Admin setup wizard |

### Environment Variables (Studio)

```bash
PORT=4000                         # Studio port (default: 4000)
STUDIO_ALLOWED_ORIGINS=...        # Comma-separated allowed CORS origins
OPENAI_API_KEY=sk-...             # Enables ada-002 embeddings in RAG
```

### Embeddable Chat Widget

Add an agent chat to any webpage:

```html
<script
  src="http://localhost:4000/widget.js"
  data-agent="AGENT_ID"
  data-key="mzn_k_..."
  data-theme="navy"
  data-lang="ar"
></script>
```

The widget opens a floating chat bubble using the agent's public chat endpoint.

---

## CLI Commands

```bash
mizan init <name>       # scaffold a new project
mizan setup             # interactive environment setup
mizan doctor            # check environment health
mizan validate <rules>  # validate rules for conflicts
mizan decide <r> <f>    # run rules against facts (JSON)
mizan parse <policy>    # extract rules from policy text
```

---

## Auto-Configuration

```js
const { autoDetectAdapter } = require('@mizan/sdk');
// Checks OPENAI_API_KEY → ANTHROPIC_API_KEY → MockAdapter
const adapter = autoDetectAdapter();
```

---

## Architecture

```
Input → Pre-check (RuleEngine) → LLM (MizanAgent.think) → Post-check (RuleEngine) → Output
              ↕                                                      ↕
         AuditLogger (hash-chain)                             UAEComplianceLayer
              ↕                                                      ↕
         RAGEngine (vector KB)                              SessionMemory (history)
```

---

## Tests

```bash
npm test        # 109 tests across 8 suites — all green
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| `rule-engine` | 7 | RuleEngine, ExpressionEvaluator integration |
| `expression-evaluator` | 28 | Safe expr eval, operators, dot notation |
| `audit-logger` | 10 | Hash chain, disk query, preload, verifyFull |
| `compliance` | 11 | PDPL, AI Ethics, NESA |
| `dubai-ai-law` | 14 | All 5 articles, bilingual, edge cases |
| `rag-engine` | 18 | Ingest, dedup, search, persist |
| `session-memory` | 14 | CRUD, persist, truncation, metadata |
| `policy-parser` | 7 | Rule extraction from natural language |

---

## License

MIT — Abdullah Alkaabi
