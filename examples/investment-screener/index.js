const path = require('path');
// Use compiled dist
const { RuleEngine, AuditLogger } = require('../../dist');

const rules = require('./rules.json');

const engine = new RuleEngine();
engine.loadRules(rules);

const logger = new AuditLogger(path.join(__dirname, 'data', 'audit.jsonl'));

console.log('⚖️  Mizan Investment Screener\n');
console.log('='.repeat(50));

const testCases = [
  { name: 'Masdar Clean Energy (UAE)', facts: { country: 'AE', amount: 5000000, sector: 'renewable', sanctioned: false } },
  { name: 'Small Startup (UAE)', facts: { country: 'AE', amount: 50000, sector: 'tech', sanctioned: false } },
  { name: 'Foreign Fund (UK)', facts: { country: 'GB', amount: 2000000, sector: 'finance', sanctioned: false } },
  { name: 'Sanctioned Entity', facts: { country: 'XX', amount: 10000000, sector: 'oil', sanctioned: true } },
];

for (const { name, facts } of testCases) {
  const decision = engine.evaluate(facts);
  logger.log(decision, facts);

  const icon = decision.result === 'APPROVED' ? '✅' : decision.result === 'REJECTED' ? '❌' : '🔍';
  console.log(`\n${icon} ${name}`);
  console.log(`   Result: ${decision.result}`);
  console.log(`   Reason: ${decision.reason}`);
  console.log(`   Score:  ${decision.score}`);
}

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Audit log: ${logger.getEntries().length} entries recorded`);
console.log('✅ Hash chain verified:', logger.verify());
