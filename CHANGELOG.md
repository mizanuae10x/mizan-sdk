# Changelog

All notable changes to `@mizan/sdk` are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] — 2026-03-01

### Added
- **`ExpressionEvaluator`** — safe recursive-descent boolean expression engine; eliminates all `new Function()` / `eval()` usage from rule evaluation (security enhancement)
- **`evaluateExpression()`** — convenience function shorthand
- `ExpressionEvaluator` and `evaluateExpression` now exported from main `@mizan/sdk` entry point
- **`AuditLogger.loadFromDisk(preload)`** — loads all historical entries from JSONL file into memory on startup; restores hash chain correctly
- **`AuditLogger.queryFromDisk(filter?)`** — query audit log from disk without holding entries in memory; safe to use after process restart
- **`AuditLogger.size()`** — returns in-memory entry count
- **`AuditLogger` constructor `preload` option** — `new AuditLogger(filePath, true)` pre-populates entries from disk
- **UAE Compliance: Dubai AI Law (Law No. 9 / 2023)** — full `DubaiAILawChecker` (Art. 3 prohibited uses, Art. 5 DDA registration, Art. 8 transparency, Art. 10 human oversight, Art. 12 data governance)
- **PDPL extended checks** — Art. 3 (data subject rights), Art. 16 (sensitive personal data), Art. 18 (breach notification 72h)
- **RAG deduplication** — SHA-256 content-hash and name-based duplicate detection; `RagIngestResult` type with `duplicate` + `duplicateType` fields
- **`RAGEngine.reingest()`** — force-replace existing document
- **`RAGEngine.findByHash()` / `findByName()`** — lookup helpers
- **`RAGEngine.deleteDocument()`** / **`getStats()`** — management and stats
- **Studio auth system** — login page, first-run admin setup, SHA-256+salt password hashing, 32-byte random session tokens, 24h expiry; all Studio pages protected
- **Studio rate limiting** — 120 req/min general API limiter + 10 req/15min auth limiter (no external library)
- **Studio CORS hardening** — configurable `STUDIO_ALLOWED_ORIGINS` env var; defaults to localhost
- **Studio session caching** — 5s in-memory TTL for session reads (eliminates disk read on every request)
- **Studio cache headers** — `no-store` for HTML pages, 1h cache for JS/CSS assets
- **File upload to RAG** — drag-and-drop in Studio (TXT, MD, PDF, DOCX, CSV, JSON); base64 + JSON — no `multer` dependency
- **Session Memory** — `SessionMemory` class with persistence, `maxMessages` truncation, metadata support
- **Webhook Triggers** — register URLs that fire on agent decisions
- **Multi-Agent Orchestration** — chain agents in sequences with context passing
- **`RagDocument.contentHash`** — SHA-256 field added; `load()` backfills existing documents
- **`RagChunk.embeddingModel`** — tracks `ada-002` vs `hash-128` per chunk to prevent mixed-dimension searches
- **Studio: 13 pages total** — login, first-run, index, rules, decide, audit, agents, setup, compliance, rag, widget-demo, webhooks, orchestration
- **8 test suites, 109 tests** — coverage for ExpressionEvaluator, DubaiAILawChecker, RAGEngine (dedup + persistence), SessionMemory, AuditLogger (disk query/preload)

### Changed
- **`RuleEngine.compileCondition()`** — replaced `new Function()` with `ExpressionEvaluator.compile()`; no API change
- **`calculatorTool`** — replaced `new Function()` with a recursive-descent math parser supporting `+`, `-`, `*`, `/`, `^` (power), unary minus, and parentheses
- **`AuditLogger` constructor** — signature extended to `(filePath?, preload?)` — backwards compatible (preload defaults to `false`)
- **`UAEComplianceLayer`** — now checks 4 frameworks: PDPL (extended), UAE AI Ethics, NESA, Dubai AI Law

### Fixed
- `AuditLogger` hash chain restoration on process restart (`restoreChainFromDisk()`)
- RAG dimension mismatch: all chunks within a document now use the same embedding model; mixed-model search blocked
- `package.json` `keywords` — added `pdpl`, `compliance`, `rag`, `dubai-ai-law`, `arabic`, `agent-platform`
- `package.json` `repository`, `homepage`, `bugs` fields populated

### Security
- Removed all `new Function()` / `eval()` usage from rule evaluation (`RuleEngine`) and tool execution (`calculatorTool`)
- Studio CORS now restricted to configured origins (previously permissive `*`)
- Auth endpoints protected with strict rate limit (10/15min per IP)

---

## [1.1.0] — 2026-02-20

### Added
- `RAGEngine` — semantic search, chunking, OpenAI ada-002 embeddings, hash-based fallback
- `SessionMemory` — per-session conversation history with persistence
- Webhook trigger registration and delivery
- Multi-agent orchestration (chain, parallel)
- Studio: rag.html, widget-demo.html, webhooks.html, orchestration.html pages
- Embeddable chat widget (`studio/public/widget.js`)
- Per-agent API keys (`studio/public/agents.html` deploy modal)

---

## [1.0.0] — 2026-02-10

### Added
- Core SDK: `RuleEngine`, `AuditLogger`, `PolicyParser`, `MizanAgent`, `ToolRegistry`, `MemoryModule`
- LLM adapters: `OpenAIAdapter`, `AnthropicAdapter`, `MockAdapter`, `autoDetectAdapter`
- UAE Compliance Layer: `PDPLChecker`, `AIEthicsGuardrails`, `NESAControls`, `UAEComplianceLayer`
- Built-in tools: `webSearchTool`, `calculatorTool`, `dateTimeTool`, `httpTool`, `fileReaderTool`
- Mizan Studio (Express server, 9 pages, port 4000)
- CLI binary (`mizan`) with interactive shell and agent run commands
- TypeScript strict mode, ES2020 target
- 26 initial tests (4 suites)
