const path = require('path');
const { RuleEngine, AuditLogger } = require('../../dist');

const rules = require('./rules.json');
const engine = new RuleEngine();
engine.loadRules(rules);

const logger = new AuditLogger(path.join(__dirname, 'data', 'audit.jsonl'));

console.log('⚖️  UAE Commercial License Compliance Checker\n');
console.log('='.repeat(50));

const entities = [
  { name: 'ABC Trading LLC (Dubai)', facts: { hasLicense: true, licenseExpired: false, restrictedActivity: false, freeZone: false } },
  { name: 'XYZ Tech (ADGM Free Zone)', facts: { hasLicense: true, licenseExpired: false, restrictedActivity: false, freeZone: true } },
  { name: 'Expired Corp', facts: { hasLicense: true, licenseExpired: true, restrictedActivity: false, freeZone: false } },
  { name: 'Unlicensed Startup', facts: { hasLicense: false, licenseExpired: false, restrictedActivity: false, freeZone: false } },
  { name: 'Weapons Dealer LLC', facts: { hasLicense: true, licenseExpired: false, restrictedActivity: true, freeZone: false } },
];

for (const { name, facts } of entities) {
  const decision = engine.evaluate(facts);
  logger.log(decision, facts);

  const icon = decision.result === 'APPROVED' ? '✅' : decision.result === 'REJECTED' ? '❌' : '🔍';
  console.log(`\n${icon} ${name}`);
  console.log(`   Result: ${decision.result}`);
  console.log(`   Reason: ${decision.reason}`);
}

console.log('\n' + '='.repeat(50));
console.log(`\n📊 ${logger.getEntries().length} audit entries | Chain valid: ${logger.verify()}`);
