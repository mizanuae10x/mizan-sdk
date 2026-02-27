const { PolicyParser } = require('../dist/PolicyParser');
const { MockAdapter } = require('../dist/adapters/MockAdapter');

describe('PolicyParser', () => {
  test('regex fallback parses lines into rules', async () => {
    const parser = new PolicyParser();
    const rules = await parser.parse('Must have valid license\nAllow if score above 80\nReview all applications');
    expect(rules.length).toBe(3);
    expect(rules[0].action).toBe('REJECTED'); // "Must"
    expect(rules[1].action).toBe('APPROVED'); // "Allow"
    expect(rules[2].action).toBe('REVIEW');
  });

  test('uses LLM adapter when provided', async () => {
    const mock = new MockAdapter();
    mock.setResponse('Extract rules', JSON.stringify([
      { id: 'R1', name: 'Min Age', condition: 'age >= 18', action: 'APPROVED', reason: 'Adult', priority: 1 },
    ]));
    const parser = new PolicyParser(mock);
    const rules = await parser.parse('Only adults allowed');
    expect(rules.length).toBe(1);
    expect(rules[0].condition).toBe('age >= 18');
  });

  test('falls back to regex on LLM failure', async () => {
    const mock = new MockAdapter('not json');
    const parser = new PolicyParser(mock);
    const rules = await parser.parse('Must validate documents');
    expect(rules.length).toBe(1);
    expect(rules[0].action).toBe('REJECTED');
  });
});
