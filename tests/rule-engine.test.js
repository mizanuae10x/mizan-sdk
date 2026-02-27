const { RuleEngine } = require('../dist/RuleEngine');

describe('RuleEngine', () => {
  let engine;
  const rules = [
    { id: 'R1', name: 'High Score', condition: 'score >= 80', action: 'APPROVED', reason: 'High score', priority: 1 },
    { id: 'R2', name: 'Low Score', condition: 'score < 30', action: 'REJECTED', reason: 'Too low', priority: 2 },
    { id: 'R3', name: 'Medium', condition: 'score >= 30 && score < 80', action: 'REVIEW', reason: 'Needs review', priority: 3 },
  ];

  beforeEach(() => {
    engine = new RuleEngine();
    engine.loadRules(rules);
  });

  test('approves high score', () => {
    const d = engine.evaluate({ score: 90 });
    expect(d.result).toBe('APPROVED');
    expect(d.matchedRule.id).toBe('R1');
  });

  test('rejects low score', () => {
    const d = engine.evaluate({ score: 10 });
    expect(d.result).toBe('REJECTED');
  });

  test('reviews medium score', () => {
    const d = engine.evaluate({ score: 50 });
    expect(d.result).toBe('REVIEW');
  });

  test('returns REVIEW when no rules match', () => {
    const e2 = new RuleEngine();
    e2.loadRules([]);
    const d = e2.evaluate({ score: 50 });
    expect(d.result).toBe('REVIEW');
    expect(d.matchedRule).toBeNull();
  });

  test('addRule works', () => {
    engine.addRule({ id: 'R4', name: 'Bonus', condition: 'bonus === true', action: 'APPROVED', reason: 'Bonus', priority: 0 });
    const d = engine.evaluate({ bonus: true, score: 10 });
    expect(d.result).toBe('APPROVED');
    expect(d.matchedRule.id).toBe('R4');
  });

  test('detectConflicts finds duplicates', () => {
    const e2 = new RuleEngine();
    e2.loadRules([
      { id: 'A', name: 'Approve', condition: 'x > 5', action: 'APPROVED', reason: 'ok', priority: 1 },
      { id: 'B', name: 'Reject', condition: 'x > 5', action: 'REJECTED', reason: 'no', priority: 2 },
    ]);
    expect(e2.detectConflicts().length).toBe(1);
  });

  test('handles complex facts', () => {
    const e2 = new RuleEngine();
    e2.loadRules([
      { id: 'R1', name: 'UAE Entity', condition: 'country === "AE" && amount > 500000', action: 'APPROVED', reason: 'UAE large investment', priority: 1 },
    ]);
    const d = e2.evaluate({ country: 'AE', amount: 1000000 });
    expect(d.result).toBe('APPROVED');
  });
});
