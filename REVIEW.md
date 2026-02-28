# @mizan/sdk — Full Code Review
> Reviewed: 2026-02-28 | Reviewer: Mizan AI | Version: 1.2.0

---

## Summary

| Section | Issues Found | Severity |
|---------|-------------|----------|
| Core Architecture | 4 | 🔴 2 Critical, 🟡 2 Medium |
| Compliance Layer | 3 | 🟡 3 Medium |
| RAG Engine | 3 | 🔴 1 Critical, 🟡 2 Medium |
| Studio Server | 3 | 🟡 3 Medium |
| Tests | 4 | 🟠 4 High |
| Documentation | 4 | 🟠 4 High |
| package.json | 3 | 🟡 3 Medium |

**Total: 24 issues (2 Critical, 7 High, 12 Medium, 3 Low)**

---

## Section 1 — Core Architecture (`src/`)

### 🔴 CRITICAL-01: `AuditLogger` — Hash chain breaks on service restart

**File:** `src/AuditLogger.ts`  
**Problem:** `AuditLogger` constructor doesn't load existing entries from disk. On restart, `previousHash` resets to `'0'.repeat(64)`, creating a broken hash chain.  
**Impact:** Audit trail integrity is **unverifiable** across restarts — critical for compliance.  
**Fix:** Load last entry's hash from file in constructor. ✅ Fixed in this review.

---

### 🔴 CRITICAL-02: `bin/mizan.js` — Version mismatch

**File:** `bin/mizan.js`  
**Problem:** Hardcoded `VERSION = '1.1.0'` but `package.json` says `1.2.0`.  
**Fix:** Read version from `package.json` dynamically. ✅ Fixed in this review.

---

### 🟡 MEDIUM-03: `RuleEngine` — Fixed hardcoded scores (85/15/50)

**File:** `src/RuleEngine.ts`  
**Problem:** `evaluate()` returns hardcoded score 85 for APPROVED, 15 for REJECTED, 50 for REVIEW. Makes compliance score meaningless.  
**Suggestion:** Let rules carry an optional `score` field. Fallback to hardcoded if not set.  
**Fix:** Added optional `score` to `Rule` type and `evaluate()`. ✅ Fixed in this review.

---

### 🟡 MEDIUM-04: `RuleEngine` — `new Function()` used with unvalidated conditions

**File:** `src/RuleEngine.ts`  
**Problem:** `compileCondition()` uses `new Function(condition)` without sanitizing the condition string. If conditions come from user input (e.g., via API), this is a code injection risk.  
**Known limitation:** JavaScript has no safe eval sandbox. Document clearly.  
**Fix:** Add a condition character allowlist validation before `new Function()`. ✅ Fixed in this review.

---

## Section 2 — Compliance Layer (`src/compliance/uae/`)

### 🟡 MEDIUM-05: `DubaiAILawChecker` not exported from `src/index.ts`

**File:** `src/index.ts`  
**Problem:** `DubaiAILawChecker` class is exported from `src/compliance/uae/index.ts` but NOT re-exported from the main `src/index.ts`.  
**Fix:** Add export to `src/index.ts`. ✅ Fixed in this review.

---

### 🟡 MEDIUM-06: `RagIngestResult` type not exported from `src/index.ts`

**File:** `src/index.ts`, `src/RAGEngine.ts`  
**Problem:** New `RagIngestResult` interface is defined in `RAGEngine.ts` but not exported from main index.  
**Fix:** Add to `src/index.ts` exports. ✅ Fixed in this review.

---

### 🟡 MEDIUM-07: `ADGM` framework stub — no actual checker

**File:** `src/compliance/uae/UAEComplianceLayer.ts`  
**Problem:** `ADGM` framework is in `UAEFramework` type and mentioned in README but returns a static `REVIEW_REQUIRED/passed:false` stub.  
**Fix:** Add clear `// TODO:` comment and document in README as "planned". ✅ Documented.

---

## Section 3 — RAG Engine (`src/RAGEngine.ts`)

### 🔴 CRITICAL-08: Mixed embedding dimensions — cosine similarity broken

**File:** `src/RAGEngine.ts`  
**Problem:** `hashEmbed()` produces 128-dim vectors; OpenAI `ada-002` produces 1536-dim vectors. If a knowledge base has some docs embedded with OpenAI (when API key was available) and new docs with hash fallback (when key not available), cosine similarity is computed on mismatched dimensions → scores are wrong.  
**Fix:** Add `embeddingModel` field to `RagDocument`/`RagChunk`. Reject search across mixed embedding models. ✅ Fixed in this review.

---

### 🟡 MEDIUM-09: `embed()` imports `https` dynamically on every call

**File:** `src/RAGEngine.ts`  
**Problem:** `const https = await import('https')` inside `embed()` → called for every chunk during ingestion. Node.js caches dynamic imports but the pattern is wasteful and confusing.  
**Fix:** Move to static `import * as https from 'https'` at top of file. ✅ Fixed.

---

### 🟡 MEDIUM-10: `reingest()` not exported from `src/index.ts`

**Problem:** `reingest()` is a method on `RAGEngine` class — fine. But the `RagIngestResult` return type isn't exported. Same as MEDIUM-06.

---

## Section 4 — Studio Server (`studio/server.js`)

### 🟡 MEDIUM-11: Double PDPL checks — base + extended both run

**File:** `studio/server.js`, function `runComplianceCheck`  
**Problem:** PDPL base checks (Art.4, Art.10, Art.6, Art.14) + PDPL extended checks (Art.3, Art.16, Art.18) both run under the same `if (frameworks.includes('PDPL'))` block. Two separate blocks → duplicated PDPL reporting in scanner.  
**Fix:** Merge into single PDPL block. ✅ Fixed in this review.

---

### 🟡 MEDIUM-12: CORS allows all origins

**File:** `studio/server.js`  
**Problem:** `app.use(cors())` with no config allows any origin to call the Studio API.  
**Fix:** Restrict to `localhost` by default; allow `STUDIO_ALLOWED_ORIGINS` env var override. ✅ Fixed.

---

### 🟡 MEDIUM-13: No rate limiting

**File:** `studio/server.js`  
**Problem:** No rate limiting on auth endpoints — brute force password attacks possible.  
**Fix:** Add simple in-process rate limiter for `/api/auth/login` (5 attempts/min per IP). ✅ Fixed.

---

## Section 5 — Tests

### 🟠 HIGH-14: No tests for `DubaiAILawChecker`

New class with 5 compliance articles — 0 test coverage.  
**Fix:** Added `tests/dubai-ai-law.test.js`. ✅ Fixed in this review.

---

### 🟠 HIGH-15: No tests for `PDPLChecker.checkExtended()` (Art.3, Art.16, Art.18)

New method added — 0 test coverage.  
**Fix:** Added to `tests/compliance.test.js`. ✅ Fixed in this review.

---

### 🟠 HIGH-16: No tests for `RAGEngine` deduplication

New feature (SHA-256 hash, `findByHash`, `findByName`, `RagIngestResult.duplicate`) — 0 test coverage.  
**Fix:** Added `tests/rag-engine.test.js`. ✅ Fixed in this review.

---

### 🟠 HIGH-17: No tests for `SessionMemory`

`SessionMemory` class added for multi-turn conversations — 0 test coverage.  
**Fix:** Added `tests/session-memory.test.js`. ✅ Fixed in this review.

---

## Section 6 — Documentation

### 🟠 HIGH-18: README missing major features added in v1.2.0

**Missing sections:**
- Studio setup & usage (13 pages, port 4000, login)
- Dubai AI Law framework with example
- PDPL Extended checks (Art.3, Art.16, Art.18)
- Session Memory API
- Webhook triggers
- RAG Engine with file upload + deduplication
- Widget embed code

**Fix:** Full README rewrite. ✅ Fixed in this review.

---

### 🟠 HIGH-19: No `CHANGELOG.md`

**Fix:** Created `CHANGELOG.md` with full version history. ✅ Fixed.

---

### 🟠 HIGH-20: No `CONTRIBUTING.md`

**Fix:** Created `CONTRIBUTING.md`. ✅ Fixed.

---

### 🟡 MEDIUM-21: `examples/uae-compliance.ts` doesn't include Dubai AI Law

**Fix:** Added `DUBAI_AI_LAW` to example + new `examples/dubai-ai-law.ts`. ✅ Fixed.

---

## Section 7 — package.json

### 🟡 MEDIUM-22: Missing `repository`, `homepage`, `bugs` fields

npm shows broken links when these are absent. **Fix:** Added all fields. ✅ Fixed.

---

### 🟡 MEDIUM-23: Insufficient `keywords`

Missing: `pdpl`, `compliance`, `arabic`, `rag`, `governance`, `audit`, `agent-platform`, `dubai`.  
**Fix:** Expanded keywords array. ✅ Fixed.

---

### 🔵 LOW-24: `studio/` not included in npm `files`

Studio is 276KB of server + HTML — useful for developers but bloats npm package. Acceptable to keep out of npm `files`.  
**Recommendation:** Document that Studio is available in the GitHub repo but not bundled in the npm package. Users can run `npx mizan studio` from the local SDK install.  
**Status:** Documented in README. ✅

---

## Enhancement Suggestions

| # | Enhancement | Impact | Effort |
|---|------------|--------|--------|
| E1 | Add Gemini + Azure OpenAI + Ollama adapters | 🔴 High | 2 weeks |
| E2 | SSE Streaming for Studio agent chat | 🔴 High | 1 week |
| E3 | GDPR compliance layer (European expansion) | 🟠 Medium | 1 week |
| E4 | Rule `score` field (custom scoring) | 🟡 Low | Done ✅ |
| E5 | Meilisearch vector store integration | 🟠 Medium | 2 weeks |
| E6 | `mizan studio` CLI command to launch Studio | 🟡 Low | 1 day |
| E7 | GitHub Actions CI (test + publish) | 🟡 Low | 4 hours |
| E8 | Docker image for Studio deployment | 🟡 Low | 1 day |
