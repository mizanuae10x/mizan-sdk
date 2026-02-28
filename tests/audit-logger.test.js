const { AuditLogger } = require('../dist/AuditLogger');
const path = require('path');
const fs = require('fs');

describe('AuditLogger', () => {
  const testFile = path.join(__dirname, '..', 'data', 'test-audit.jsonl');
  let logger;

  beforeEach(() => {
    // Delete BEFORE constructing so logger always starts with genesis hash
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    logger = new AuditLogger(testFile);
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  const mockDecision = {
    result: 'APPROVED',
    matchedRule: { id: 'R1', name: 'Test', condition: 'true', action: 'APPROVED', reason: 'ok', priority: 1 },
    reason: 'ok',
    score: 85,
    auditId: 'test-001',
  };

  test('logs entries with hash chain', () => {
    const e1 = logger.log(mockDecision, { x: 1 });
    const e2 = logger.log(mockDecision, { x: 2 });
    expect(e1.hash).toBeTruthy();
    expect(e2.previousHash).toBe(e1.hash);
  });

  test('writes to JSONL file', () => {
    logger.log(mockDecision, { x: 1 });
    expect(fs.existsSync(testFile)).toBe(true);
    const lines = fs.readFileSync(testFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.output.result).toBe('APPROVED');
  });

  test('verify returns true for valid chain', () => {
    logger.log(mockDecision, { a: 1 });
    logger.log(mockDecision, { a: 2 });
    logger.log(mockDecision, { a: 3 });
    expect(logger.verify()).toBe(true);
  });

  test('exportCSV produces valid CSV', () => {
    logger.log(mockDecision, { x: 1 });
    const csv = logger.exportCSV();
    expect(csv).toContain('id,timestamp,result');
    expect(csv).toContain('APPROVED');
  });

  test('query filters by result', () => {
    logger.log(mockDecision, { x: 1 });
    logger.log({ ...mockDecision, result: 'REJECTED', auditId: 'test-002' }, { x: 2 });
    const approved = logger.query({ result: 'APPROVED' });
    expect(approved.length).toBe(1);
  });

  // ── New: loadFromDisk, queryFromDisk, size, preload ───────────────────────

  test('size() returns in-memory entry count', () => {
    expect(logger.size()).toBe(0);
    logger.log(mockDecision, { x: 1 });
    logger.log(mockDecision, { x: 2 });
    expect(logger.size()).toBe(2);
  });

  test('queryFromDisk() reads entries written by another logger instance', () => {
    logger.log(mockDecision, { source: 'session-1' });
    logger.log({ ...mockDecision, result: 'REJECTED', auditId: 'test-disk' }, { source: 'session-2' });

    // Fresh instance — in-memory is empty, but disk has data
    const reader = new AuditLogger(testFile);
    expect(reader.size()).toBe(0); // no preload
    const all = reader.queryFromDisk();
    expect(all.length).toBe(2);
    const filtered = reader.queryFromDisk({ result: 'APPROVED' });
    expect(filtered.length).toBe(1);
  });

  test('loadFromDisk() populates in-memory entries after restart', () => {
    logger.log(mockDecision, { x: 1 });
    logger.log(mockDecision, { x: 2 });
    logger.log(mockDecision, { x: 3 });

    // Fresh instance with preload=true
    const reloaded = new AuditLogger(testFile, true);
    expect(reloaded.size()).toBe(3);
    expect(reloaded.getEntries().length).toBe(3);
  });

  test('preload constructor option restores hash chain for new entries', () => {
    logger.log(mockDecision, { x: 1 });
    const lastEntry = logger.getEntries()[0];

    const reloaded = new AuditLogger(testFile, true);
    const newEntry = reloaded.log(mockDecision, { x: 2 });
    // New entry's previousHash should chain from the last persisted entry
    expect(newEntry.previousHash).toBe(lastEntry.hash);
  });

  test('verifyFull() passes after loadFromDisk entries', () => {
    logger.log(mockDecision, { x: 1 });
    logger.log(mockDecision, { x: 2 });
    expect(logger.verifyFull()).toBe(true);
  });
});
