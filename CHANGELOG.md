# Changelog

All notable changes to `@mizan/sdk` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · [Semantic Versioning](https://semver.org/)

---

## [1.2.0] — 2026-02-28

### Added
- **Dubai AI Law (Law No. 9/2023)** compliance framework — 5 articles (Art. 3, 5, 8, 10, 12)
- **PDPL Extended Checks** — Art. 3 (Data Subject Rights), Art. 16 (Sensitive Data), Art. 18 (Breach Notification 72h)
- **RAG Deduplication** — SHA-256 content hash + name deduplication; `RagIngestResult.duplicate`, `duplicateType` ('hash' | 'name')
- `RAGEngine.reingest()` — force-replace existing document by name
- `RAGEngine.findByHash()` and `RAGEngine.findByName()` helpers
- `RagChunk.embeddingModel` field — tracks 'ada-002' vs 'hash-128' to prevent mixed-dimension cosine similarity
- **Studio Auth System** — `login.html`, `first-run.html`, `/api/auth/*` endpoints (SHA-256 + 24h sessions)
- **Session Memory** (`SessionMemory` class) — multi-turn conversation history per agent, persisted to JSON
- **Webhook Triggers** — `/api/webhooks/*` endpoints for event-driven agent execution
- **Multi-Agent Orchestration** — `/api/orchestration/*` endpoints for agent-to-agent calls
- **File Upload** in Knowledge Base — drag-and-drop, base64 encoding, PDF/DOCX text extraction
- Per-agent Auth guard in all 11 Studio pages (redirect → `/login.html` if unauthenticated)
- Nav user pill with logout button in all Studio pages
- `DubaiAILawChecker` exported from `@mizan/sdk`
- `RagIngestResult` type exported from `@mizan/sdk`
- **Rate limiting** on `/api/auth/login` (10 attempts/min per IP)
- **CORS configuration** — default restrict to localhost; configurable via `STUDIO_ALLOWED_ORIGINS`

### Fixed
- `AuditLogger` — hash chain now restored on service restart via `restoreChainFromDisk()`
- `AuditLogger.verify()` — uses first entry's actual `previousHash` as chain start (regression from restart fix)
- `AuditLogger.verifyFull()` — new method for full genesis-to-end disk verification
- `bin/mizan.js` — version now read dynamically from `package.json` (was hardcoded 1.1.0)
- `RuleEngine` — condition strings now validated with allowlist before `new Function()` compilation
- `RAGEngine` — `https` now statically imported at module top (was dynamic per-call import)
- `studio/server.js` — PDPL checks merged into single block (was duplicated across two `if` blocks)

### Changed
- `Rule.score` — new optional field; if set, overrides the default scores (APPROVED=85, REJECTED=15, REVIEW=50)
- `RAGEngine.ingest()` — now returns `RagIngestResult` (was `RagDocument`); callers must check `.doc`

### Tests
- Added `tests/dubai-ai-law.test.js` — 15 tests for DubaiAILawChecker (5 articles × 3 scenarios)
- Added `tests/session-memory.test.js` — 12 tests covering CRUD, persistence, maxMessages
- Added `tests/rag-engine.test.js` — 20 tests covering ingest, dedup, hash, name lookup, delete, persist
- Extended `tests/compliance.test.js` — 8 new tests for PDPLChecker.checkExtended (Art. 3, 16, 18)
- **Total: 77 tests passing (was 26)**

---

## [1.1.0] — 2026-02-21

### Added
- `UAEComplianceLayer` with 3 frameworks: PDPL, UAE AI Ethics, NESA
- `PDPLChecker` — Art. 4, 6, 10, 14 (cross-border transfer)
- `AIEthicsGuardrails` — 6 principles (Inclusiveness, Reliability, Transparency, Privacy, Security, Accountability)
- `NESAControls` — 4 controls (audit logging, data classification, incident response, access/encryption)
- `RAGEngine` — semantic search, OpenAI ada-002 embeddings, hash fallback, cosine similarity, `data/rag-store.json`
- Mizan Studio (port 4000) — 9 pages: index, rules, decide, audit, agents, setup, compliance, rag, widget-demo
- `studio/public/widget.js` — embeddable chat widget (navy/gold, Arabic RTL)
- Per-agent API key management (`/api/agents/:id/keys`)
- Agent deploy modal (3 tabs: API key, embed snippet, test chat)
- Agent builder form — system prompt templates, RAG toggle, compliance checkboxes, tools, language

---

## [1.0.0] — 2026-02-14

### Added
- `MizanAgent` — abstract base class with pre/post rule checks, LLM adapter, tool registry, memory
- `RuleEngine` — JavaScript expression compiler with conflict detection
- `AuditLogger` — SHA-256 hash-chained JSONL audit trail
- `PolicyParser` — LLM-assisted + regex fallback policy-to-rules extraction
- `ToolRegistry` — register/execute tools; OpenAI/Anthropic format converters
- `MemoryModule` — file-backed keyword memory with `store()` / `search()`
- `OpenAIAdapter` + `AnthropicAdapter` + `MockAdapter` + `autoDetectAdapter()`
- Built-in tools: `web_search`, `calculate`, `get_datetime`, `http_request`, `read_file`
- `mizan` CLI: `init`, `setup`, `doctor`, `validate`, `decide`, `parse`
- 26 unit tests across 4 suites
