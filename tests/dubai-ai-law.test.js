const { DubaiAILawChecker } = require('../dist');

describe('DubaiAILawChecker — Dubai Law No. 9 of 2023', () => {
  const checker = new DubaiAILawChecker();
  const config = { frameworks: ['DUBAI_AI_LAW'], language: 'both', auditLevel: 'full', dataResidency: 'UAE' };

  // Art. 3 — Prohibited Uses
  test('Art.3: flags deepfake as prohibited', () => {
    const checks = checker.check({ useCase: 'deepfake_generation', type: 'media' }, config);
    const art3 = checks.find(c => c.article.includes('Art. 3'));
    expect(art3).toBeDefined();
    expect(art3.passed).toBe(false);
    expect(art3.status).toBe('NON_COMPLIANT');
  });

  test('Art.3: passes clean use case', () => {
    const checks = checker.check({ useCase: 'document_classification', type: 'government' }, config);
    const art3 = checks.find(c => c.article.includes('Art. 3'));
    expect(art3.passed).toBe(true);
    expect(art3.status).toBe('COMPLIANT');
  });

  test('Art.3: flags social_scoring', () => {
    const checks = checker.check({ feature: 'social_scoring', target: 'citizens' }, config);
    const art3 = checks.find(c => c.article.includes('Art. 3'));
    expect(art3.passed).toBe(false);
  });

  // Art. 5 — Registration
  test('Art.5: high-risk AI without registration triggers review', () => {
    const checks = checker.check({ useCase: 'biometric_identification', sector: 'border' }, config);
    const art5 = checks.find(c => c.article.includes('Art. 5'));
    expect(art5.passed).toBe(false);
    expect(art5.status).toBe('REVIEW_REQUIRED');
  });

  test('Art.5: high-risk AI with registration ID passes', () => {
    const checks = checker.check({ useCase: 'biometric_identification', aiRegistrationId: 'DDA-2026-001' }, config);
    const art5 = checks.find(c => c.article.includes('Art. 5'));
    expect(art5.passed).toBe(true);
  });

  test('Art.5: low-risk AI passes without registration', () => {
    const checks = checker.check({ useCase: 'text_summarization' }, config);
    const art5 = checks.find(c => c.article.includes('Art. 5'));
    expect(art5.passed).toBe(true);
  });

  // Art. 8 — Transparency
  test('Art.8: missing disclosure triggers review for user-facing AI', () => {
    const checks = checker.check({ channel: 'chatbot', users: 'public' }, config);
    const art8 = checks.find(c => c.article.includes('Art. 8'));
    expect(art8.status).toBe('REVIEW_REQUIRED');
    expect(art8.passed).toBe(false);
  });

  test('Art.8: aiDisclosure=true passes', () => {
    const checks = checker.check({ channel: 'chatbot', aiDisclosure: true }, config);
    const art8 = checks.find(c => c.article.includes('Art. 8'));
    expect(art8.passed).toBe(true);
    expect(art8.status).toBe('COMPLIANT');
  });

  // Art. 10 — Human Oversight
  test('Art.10: high-risk AI without human oversight fails', () => {
    const checks = checker.check({ useCase: 'healthcare_decision', automated_decision: true }, config);
    const art10 = checks.find(c => c.article.includes('Art. 10'));
    expect(art10.passed).toBe(false);
    expect(art10.status).toBe('NON_COMPLIANT');
  });

  test('Art.10: human oversight marker passes high-risk check', () => {
    const checks = checker.check({ useCase: 'healthcare_decision', humanReview: true }, config);
    const art10 = checks.find(c => c.article.includes('Art. 10'));
    expect(art10.passed).toBe(true);
  });

  test('Art.10: non-consequential use passes without oversight', () => {
    const checks = checker.check({ useCase: 'text_translation' }, config);
    const art10 = checks.find(c => c.article.includes('Art. 10'));
    expect(art10.passed).toBe(true);
  });

  // Art. 12 — Data Governance
  test('Art.12: missing data governance policy triggers review', () => {
    const checks = checker.check({ useCase: 'data_analysis' }, config);
    const art12 = checks.find(c => c.article.includes('Art. 12'));
    expect(art12.status).toBe('REVIEW_REQUIRED');
  });

  test('Art.12: dataGovernance reference passes', () => {
    const checks = checker.check({ useCase: 'data_analysis', dataGovernance: 'DG-Policy-2026' }, config);
    const art12 = checks.find(c => c.article.includes('Art. 12'));
    expect(art12.passed).toBe(true);
  });

  // Full check returns 5 articles
  test('Full check returns 5 articles', () => {
    const checks = checker.check({ useCase: 'document_review', aiDisclosure: true, dataGovernance: 'DG-001' }, config);
    expect(checks.length).toBe(5);
    expect(checks.every(c => c.framework === 'DUBAI_AI_LAW')).toBe(true);
  });

  // Bilingual fields
  test('All checks have Arabic requirement text', () => {
    const checks = checker.check({}, config);
    checks.forEach(c => {
      expect(c.requirementAr).toBeTruthy();
      expect(c.requirementAr.length).toBeGreaterThan(10);
    });
  });
});
