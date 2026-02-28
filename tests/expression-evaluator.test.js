const { ExpressionEvaluator, evaluateExpression } = require('../dist');

describe('ExpressionEvaluator — safe boolean expression engine', () => {
  let ev;

  beforeEach(() => {
    ev = new ExpressionEvaluator();
  });

  // ── Comparison operators ────────────────────────────────────────────────────

  test('> operator', () => {
    expect(ev.evaluate('score > 80', { score: 90 })).toBe(true);
    expect(ev.evaluate('score > 80', { score: 80 })).toBe(false);
  });

  test('>= operator', () => {
    expect(ev.evaluate('score >= 80', { score: 80 })).toBe(true);
    expect(ev.evaluate('score >= 80', { score: 79 })).toBe(false);
  });

  test('< operator', () => {
    expect(ev.evaluate('score < 30', { score: 29 })).toBe(true);
    expect(ev.evaluate('score < 30', { score: 30 })).toBe(false);
  });

  test('<= operator', () => {
    expect(ev.evaluate('score <= 30', { score: 30 })).toBe(true);
    expect(ev.evaluate('score <= 30', { score: 31 })).toBe(false);
  });

  test('=== strict equality (number)', () => {
    expect(ev.evaluate('score === 100', { score: 100 })).toBe(true);
    expect(ev.evaluate('score === 100', { score: 99 })).toBe(false);
  });

  test('=== strict equality (string)', () => {
    expect(ev.evaluate('country === "AE"', { country: 'AE' })).toBe(true);
    expect(ev.evaluate('country === "AE"', { country: 'US' })).toBe(false);
  });

  test('=== strict equality (boolean)', () => {
    expect(ev.evaluate('bonus === true', { bonus: true })).toBe(true);
    expect(ev.evaluate('bonus === true', { bonus: false })).toBe(false);
  });

  test('!== inequality', () => {
    expect(ev.evaluate('status !== "blocked"', { status: 'active' })).toBe(true);
    expect(ev.evaluate('status !== "blocked"', { status: 'blocked' })).toBe(false);
  });

  test('== loose equality', () => {
    expect(ev.evaluate('score == 50', { score: 50 })).toBe(true);
  });

  test('!= loose inequality', () => {
    expect(ev.evaluate('score != 50', { score: 60 })).toBe(true);
  });

  // ── Logical operators ───────────────────────────────────────────────────────

  test('&& both true', () => {
    expect(ev.evaluate('score >= 30 && score < 80', { score: 50 })).toBe(true);
  });

  test('&& one false', () => {
    expect(ev.evaluate('score >= 30 && score < 80', { score: 85 })).toBe(false);
  });

  test('|| one true', () => {
    expect(ev.evaluate('status === "admin" || score > 90', { status: 'user', score: 95 })).toBe(true);
  });

  test('|| both false', () => {
    expect(ev.evaluate('status === "admin" || score > 90', { status: 'user', score: 50 })).toBe(false);
  });

  test('! negation', () => {
    expect(ev.evaluate('!(status === "blocked")', { status: 'active' })).toBe(true);
    expect(ev.evaluate('!(status === "blocked")', { status: 'blocked' })).toBe(false);
  });

  // ── Parentheses ─────────────────────────────────────────────────────────────

  test('parentheses group correctly', () => {
    // (A || B) && C
    expect(ev.evaluate('(score > 90 || bonus === true) && country === "AE"', {
      score: 95, bonus: false, country: 'AE'
    })).toBe(true);

    expect(ev.evaluate('(score > 90 || bonus === true) && country === "AE"', {
      score: 50, bonus: false, country: 'AE'
    })).toBe(false);
  });

  // ── Complex conditions (UAE rule patterns) ─────────────────────────────────

  test('UAE entity large investment rule', () => {
    const r = { id: '1', name: 'UAE Large', condition: 'country === "AE" && amount > 500000',
                action: 'APPROVED', reason: 'ok', priority: 1 };
    const { RuleEngine } = require('../dist');
    const engine = new RuleEngine();
    engine.loadRules([r]);
    expect(engine.evaluate({ country: 'AE', amount: 1000000 }).result).toBe('APPROVED');
    expect(engine.evaluate({ country: 'US', amount: 1000000 }).result).toBe('REVIEW');
  });

  test('three-term &&', () => {
    expect(ev.evaluate('a > 0 && b > 0 && c > 0', { a: 1, b: 2, c: 3 })).toBe(true);
    expect(ev.evaluate('a > 0 && b > 0 && c > 0', { a: 1, b: 0, c: 3 })).toBe(false);
  });

  // ── Dot-notation fact access ────────────────────────────────────────────────

  test('dot notation: user.role', () => {
    expect(ev.evaluate('user.role === "admin"', { user: { role: 'admin' } })).toBe(true);
    expect(ev.evaluate('user.role === "admin"', { user: { role: 'viewer' } })).toBe(false);
  });

  test('dot notation: missing path returns false gracefully', () => {
    expect(ev.evaluate('user.role === "admin"', { user: null })).toBe(false);
    expect(ev.evaluate('user.role === "admin"', {})).toBe(false);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  test('single true literal', () => {
    expect(ev.evaluate('flag === true', { flag: true })).toBe(true);
  });

  test('null literal', () => {
    expect(ev.evaluate('val === null', { val: null })).toBe(true);
  });

  test('unknown fact returns false, does not throw', () => {
    expect(ev.evaluate('missing > 5', {})).toBe(false);
  });

  test('single quoted string', () => {
    expect(ev.evaluate("country === 'UAE'", { country: 'UAE' })).toBe(true);
  });

  test('returns false on syntax error (no throw)', () => {
    expect(ev.evaluate('score >>> 80', { score: 90 })).toBe(false);
  });

  // ── compile() reuse ─────────────────────────────────────────────────────────

  test('compile() returns reusable function', () => {
    const fn = ev.compile('score >= 80');
    expect(fn({ score: 90 })).toBe(true);
    expect(fn({ score: 70 })).toBe(false);
    // Call multiple times — no state leak
    expect(fn({ score: 80 })).toBe(true);
  });

  // ── evaluateExpression() shorthand ─────────────────────────────────────────

  test('evaluateExpression() shorthand', () => {
    expect(evaluateExpression('amount > 1000', { amount: 5000 })).toBe(true);
    expect(evaluateExpression('amount > 1000', { amount: 500 })).toBe(false);
  });
});
