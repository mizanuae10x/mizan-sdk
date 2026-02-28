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

// ---- Extended PDPL checks (Art. 3, Art. 16, Art. 18) ----
describe('PDPLChecker extended checks', () => {
  const checker = new PDPLChecker();
  const config = { frameworks: ['PDPL'], language: 'both', auditLevel: 'full', dataResidency: 'UAE' };

  test('Art.3: flags missing data subject rights', () => {
    const checks = checker.checkExtended({ userId: 'U1', email: 'a@b.com' }, config);
    const art3 = checks.find(c => c.article.includes('Art. 3'));
    expect(art3).toBeDefined();
    expect(art3.passed).toBe(false);
    expect(art3.status).toBe('REVIEW_REQUIRED');
  });

  test('Art.3: passes with dsr_enabled marker', () => {
    const checks = checker.checkExtended({ userId: 'U1', dsr_enabled: true }, config);
    const art3 = checks.find(c => c.article.includes('Art. 3'));
    expect(art3.passed).toBe(true);
  });

  test('Art.16: flags health data without explicit consent', () => {
    const checks = checker.checkExtended({ healthRecord: 'diabetes', userId: 'U2' }, config);
    const art16 = checks.find(c => c.article.includes('Art. 16'));
    expect(art16).toBeDefined();
    expect(art16.passed).toBe(false);
    expect(art16.status).toBe('NON_COMPLIANT');
  });

  test('Art.16: passes health data WITH explicit consent', () => {
    const checks = checker.checkExtended({ healthRecord: 'diabetes', sensitiveDataConsent: true }, config);
    const art16 = checks.find(c => c.article.includes('Art. 16'));
    expect(art16.passed).toBe(true);
  });

  test('Art.16: passes when no sensitive data present', () => {
    const checks = checker.checkExtended({ action: 'document_review', role: 'analyst' }, config);
    const art16 = checks.find(c => c.article.includes('Art. 16'));
    expect(art16.passed).toBe(true);
  });

  test('Art.18: flags missing breach notification plan', () => {
    const checks = checker.checkExtended({ service: 'data_processing' }, config);
    const art18 = checks.find(c => c.article.includes('Art. 18'));
    expect(art18).toBeDefined();
    expect(art18.passed).toBe(false);
    expect(art18.status).toBe('REVIEW_REQUIRED');
  });

  test('Art.18: passes with breach notification enabled', () => {
    const checks = checker.checkExtended({ service: 'data_processing', breachNotificationEnabled: true, dpo_contact: 'dpo@example.ae' }, config);
    const art18 = checks.find(c => c.article.includes('Art. 18'));
    expect(art18.passed).toBe(true);
  });

  test('Extended check returns exactly 3 articles (Art.3, Art.16, Art.18)', () => {
    const checks = checker.checkExtended({ action: 'test' }, config);
    expect(checks).toHaveLength(3);
    const articles = checks.map(c => c.article);
    expect(articles.some(a => a.includes('Art. 3'))).toBe(true);
    expect(articles.some(a => a.includes('Art. 16'))).toBe(true);
    expect(articles.some(a => a.includes('Art. 18'))).toBe(true);
  });
});
