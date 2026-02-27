const { AuditLogger } = require('../dist/AuditLogger');
const path = require('path');
const fs = require('fs');

describe('AuditLogger', () => {
  const testFile = path.join(__dirname, '..', 'data', 'test-audit.jsonl');
  let logger;

  beforeEach(() => {
    logger = new AuditLogger(testFile);
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
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
});
