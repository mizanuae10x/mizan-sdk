const {
  PDPLChecker,
  AIEthicsGuardrails,
  NESAControls,
  UAEComplianceLayer,
} = require('../dist');

describe('UAE compliance modules', () => {
  const defaultConfig = {
    frameworks: ['PDPL', 'UAE_AI_ETHICS', 'NESA'],
    language: 'both',
    auditLevel: 'full',
    dataResidency: 'UAE',
  };

  const baseDecision = {
    result: 'APPROVED',
    matchedRule: null,
    reason: 'Approved by policy',
    score: 88,
    auditId: 'audit-1',
  };

  const baseAuditEntry = {
    id: 'entry-1',
    timestamp: new Date().toISOString(),
    input: { purpose: 'loan_assessment', dataResidency: 'UAE', role: 'officer' },
    output: baseDecision,
    rule: null,
    hash: 'a'.repeat(64),
    previousHash: '0'.repeat(64),
  };

  test('PDPLChecker detects Emirates ID', () => {
    const checker = new PDPLChecker();
    const pii = checker.detectPII({ emiratesId: '784-1987-1234567-1' });
    expect(pii).toContain('EMIRATES_ID');
  });

  test('PDPLChecker detects UAE phone', () => {
    const checker = new PDPLChecker();
    const pii = checker.detectPII({ phone: '+971501234567' });
    expect(pii).toContain('UAE_PHONE');
  });

  test('PDPLChecker detects email', () => {
    const checker = new PDPLChecker();
    const pii = checker.detectPII({ email: 'person@example.com' });
    expect(pii).toContain('EMAIL');
  });

  test('PDPLChecker passes clean input', () => {
    const checker = new PDPLChecker();
    const checks = checker.check(
      { action: 'risk_scoring', dataResidency: 'UAE' },
      defaultConfig
    );
    expect(checks.every(c => c.passed)).toBe(true);
  });

  test('AIEthicsGuardrails flags low confidence decision', () => {
    const guardrails = new AIEthicsGuardrails();
    const lowDecision = { ...baseDecision, score: 25 };
    const checks = guardrails.evaluate(
      lowDecision,
      { action: 'fraud_check', dataResidency: 'UAE', consent: true },
      defaultConfig
    );
    const reliability = checks.find(c => c.article === 'Reliability Principle');
    expect(reliability.passed).toBe(false);
  });

  test('AIEthicsGuardrails passes high confidence with audit trail', () => {
    const guardrails = new AIEthicsGuardrails();
    const decision = { ...baseDecision, score: 91, reason: 'Transparent decision reason text' };
    const checks = guardrails.evaluate(
      decision,
      { purpose: 'credit_assessment', dataResidency: 'UAE', consent: true },
      defaultConfig
    );
    const reliability = checks.find(c => c.article === 'Reliability Principle');
    const transparency = checks.find(c => c.article === 'Transparency Principle');
    expect(reliability.passed).toBe(true);
    expect(transparency.passed).toBe(true);
  });

  test('NESAControls classifies data correctly', () => {
    const controls = new NESAControls();
    expect(controls.classifyData({})).toBe('PUBLIC');
    expect(controls.classifyData({ task: 'screening' })).toBe('INTERNAL');
    expect(controls.classifyData({ email: 'person@example.com' })).toBe('CONFIDENTIAL');
    expect(controls.classifyData({ password: '12345' })).toBe('SECRET');
  });

  test('NESAControls classifies incident levels', () => {
    const controls = new NESAControls();
    expect(controls.classifyIncident({ ...baseDecision, result: 'APPROVED', score: 95 })).toBe('LOW');
    expect(controls.classifyIncident({ ...baseDecision, result: 'REVIEW', score: 55 })).toBe('MEDIUM');
    expect(controls.classifyIncident({ ...baseDecision, result: 'REJECTED', score: 35 })).toBe('HIGH');
    expect(controls.classifyIncident({ ...baseDecision, result: 'REJECTED', score: 15 })).toBe('CRITICAL');
  });

  test('UAEComplianceLayer runs full evaluation pipeline', () => {
    const layer = new UAEComplianceLayer(defaultConfig);
    const report = layer.evaluate(
      {
        purpose: 'loan_assessment',
        consent: true,
        dataResidency: 'UAE',
        role: 'analyst',
        encryptionInTransit: true,
      },
      baseDecision,
      baseAuditEntry
    );
    expect(report.frameworks).toEqual(expect.arrayContaining(['PDPL', 'UAE_AI_ETHICS', 'NESA']));
    expect(report.checks.length).toBeGreaterThan(6);
    expect(typeof report.auditHash).toBe('string');
  });

  test('UAEComplianceLayer quickCheck returns issues', () => {
    const layer = new UAEComplianceLayer(defaultConfig);
    const result = layer.quickCheck(
      {
        email: 'person@example.com',
        action: 'marketing',
        dataResidency: 'US',
      },
      { ...baseDecision, score: 20, reason: 'short' }
    );
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('UAEComplianceLayer bilingual report generation', () => {
    const layer = new UAEComplianceLayer(defaultConfig);
    const report = layer.evaluate(
      { purpose: 'underwriting', dataResidency: 'UAE', consent: true, role: 'reviewer' },
      baseDecision,
      baseAuditEntry
    );
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.summaryAr.length).toBeGreaterThan(0);
  });
});
