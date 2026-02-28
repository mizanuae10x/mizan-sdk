const { RAGEngine } = require('../dist');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('RAGEngine — Deduplication & Core', () => {
  let rag;
  let tmpStore;

  beforeEach(() => {
    tmpStore = path.join(os.tmpdir(), `rag-test-${Date.now()}.json`);
    rag = new RAGEngine(tmpStore);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpStore); } catch {}
  });

  // ---- Basic ingest ----
  test('ingest returns doc with duplicate=false on first ingest', async () => {
    const result = await rag.ingest('PDPL Summary', 'Federal Decree-Law No. 45 of 2021 on personal data protection in the UAE.');
    expect(result.duplicate).toBe(false);
    expect(result.doc).toBeDefined();
    expect(result.doc.name).toBe('PDPL Summary');
    expect(result.doc.id).toMatch(/^doc-/);
    expect(result.doc.contentHash).toHaveLength(64); // SHA-256 hex
  }, 15000);

  test('ingest creates chunks', async () => {
    const content = Array(20).fill('This is a test sentence about UAE AI governance compliance.').join(' ');
    const result = await rag.ingest('Long Doc', content);
    expect(result.doc.chunks.length).toBeGreaterThan(0);
  }, 15000);

  // ---- Hash deduplication ----
  test('duplicate by hash: same content returns duplicate=true', async () => {
    const content = 'Dubai AI Law No. 9 of 2023 regulates artificial intelligence in Dubai.';
    await rag.ingest('Dubai AI Law', content);
    const second = await rag.ingest('Dubai AI Law v2', content); // same content, different name
    expect(second.duplicate).toBe(true);
    expect(second.duplicateType).toBe('hash');
  }, 15000);

  // ---- Name deduplication ----
  test('duplicate by name: same name returns duplicate=true', async () => {
    await rag.ingest('NESA Controls', 'NESA cybersecurity controls for UAE AI systems.');
    const second = await rag.ingest('NESA Controls', 'Completely different content about something else.');
    expect(second.duplicate).toBe(true);
    expect(second.duplicateType).toBe('name');
  }, 15000);

  // ---- Force reingest ----
  test('reingest: replaces existing document', async () => {
    await rag.ingest('MyDoc', 'Original content version 1.');
    const result = await rag.reingest('MyDoc', 'Updated content version 2.');
    expect(result.duplicate).toBe(false);
    const docs = rag.listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('MyDoc');
  }, 15000);

  // ---- Content hash ----
  test('contentHash produces consistent SHA-256', () => {
    const h1 = rag.contentHash('Hello World');
    const h2 = rag.contentHash('Hello World');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test('contentHash differs for different content', () => {
    const h1 = rag.contentHash('Content A');
    const h2 = rag.contentHash('Content B');
    expect(h1).not.toBe(h2);
  });

  // ---- findByHash / findByName ----
  test('findByHash returns existing doc', async () => {
    const content = 'Test content for hash lookup.';
    const hash = rag.contentHash(content);
    await rag.ingest('Hash Test', content);
    const found = rag.findByHash(hash);
    expect(found).not.toBeNull();
    expect(found.name).toBe('Hash Test');
  }, 15000);

  test('findByHash returns null for unknown hash', () => {
    expect(rag.findByHash('a'.repeat(64))).toBeNull();
  });

  test('findByName is case-insensitive', async () => {
    await rag.ingest('UAE Policy', 'Some policy text.');
    expect(rag.findByName('uae policy')).not.toBeNull();
    expect(rag.findByName('UAE POLICY')).not.toBeNull();
  }, 15000);

  // ---- List / Delete ----
  test('listDocuments returns metadata without content', async () => {
    await rag.ingest('Doc A', 'Content of document A.');
    const docs = rag.listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBeDefined();
    expect(docs[0].chunkCount).toBeGreaterThan(0);
    expect(docs[0].contentHash).toHaveLength(64);
    expect(docs[0].content).toBeUndefined(); // heavy fields stripped
  }, 15000);

  test('deleteDocument removes doc and its chunks', async () => {
    const result = await rag.ingest('Doc To Delete', 'This will be deleted.');
    const docId = result.doc.id;
    const deleted = rag.deleteDocument(docId);
    expect(deleted).toBe(true);
    expect(rag.listDocuments()).toHaveLength(0);
    expect(rag.findByName('Doc To Delete')).toBeNull();
  }, 15000);

  test('deleteDocument returns false for unknown id', () => {
    expect(rag.deleteDocument('non-existent')).toBe(false);
  });

  // ---- Stats ----
  test('getStats returns correct counts', async () => {
    await rag.ingest('Stats Test', 'Content for stats test.');
    const stats = rag.getStats();
    expect(stats.documentCount).toBe(1);
    expect(stats.chunkCount).toBeGreaterThan(0);
  }, 15000);

  // ---- Embedding model tracking ----
  test('embeddingModel returns a valid model string', () => {
    expect(['ada-002', 'hash-128']).toContain(rag.embeddingModel);
  });

  test('ingest tags all chunks with consistent embeddingModel', async () => {
    const result = await rag.ingest('Model Test', 'Testing embedding model tracking.');
    const model = result.doc.chunks[0].embeddingModel;
    expect(['ada-002', 'hash-128']).toContain(model);
    // All chunks in the same doc should use the same model
    result.doc.chunks.forEach(c => expect(c.embeddingModel).toBe(model));
  }, 15000);

  // ---- Persist and reload ----
  test('data persists to disk and reloads', async () => {
    await rag.ingest('Persistent Doc', 'This content should survive a restart.');
    const rag2 = new RAGEngine(tmpStore);
    expect(rag2.listDocuments()).toHaveLength(1);
    expect(rag2.listDocuments()[0].name).toBe('Persistent Doc');
  }, 15000);
});
