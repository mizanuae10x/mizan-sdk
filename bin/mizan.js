#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const logo = `${c.yellow}⚖️  Mizan SDK v1.0.0${c.reset}`;

function print(msg, color = '') { console.log(`${color}${msg}${c.reset}`); }

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'init': return cmdInit(args[0]);
    case 'validate': return cmdValidate(args[0]);
    case 'decide': return cmdDecide(args[0], args[1]);
    case 'parse': return cmdParse(args[0]);
    case 'help': case '--help': case undefined: return cmdHelp();
    default:
      print(`Unknown command: ${command}`, c.red);
      cmdHelp();
      process.exit(1);
  }
}

function cmdHelp() {
  console.log(logo);
  console.log(`
${c.bold}Usage:${c.reset} mizan <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}init${c.reset} <name>            Create a new Mizan project
  ${c.cyan}validate${c.reset} <rules.json>  Validate rules for conflicts
  ${c.cyan}decide${c.reset} <rules> <facts> Run engine and print decision
  ${c.cyan}parse${c.reset} <policy.txt>     Extract rules from policy text
  ${c.cyan}help${c.reset}                   Show this help message
`);
}

function cmdInit(name) {
  if (!name) { print('Usage: mizan init <project-name>', c.red); process.exit(1); }
  console.log(logo);
  const dir = path.resolve(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });

  const rules = [
    { id: 'R1', name: 'Default Approve', condition: 'score >= 70', action: 'APPROVED', reason: 'Score meets threshold', priority: 1 },
    { id: 'R2', name: 'Low Score Reject', condition: 'score < 30', action: 'REJECTED', reason: 'Score too low', priority: 2 },
    { id: 'R3', name: 'Manual Review', condition: 'score >= 30 && score < 70', action: 'REVIEW', reason: 'Needs manual review', priority: 3 },
  ];

  fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify(rules, null, 2));
  fs.writeFileSync(path.join(dir, '.env.example'), 'OPENAI_API_KEY=sk-...\nANTHROPIC_API_KEY=sk-ant-...\n');
  fs.writeFileSync(path.join(dir, 'index.js'), `const { RuleEngine, AuditLogger } = require('@mizan/sdk');

const rules = require('./rules.json');
const engine = new RuleEngine();
engine.loadRules(rules);

const logger = new AuditLogger('./data/audit.jsonl');
const decision = engine.evaluate({ score: 85 });
logger.log(decision, { score: 85 });

console.log('Decision:', decision);
`);

  print(`\n✅ Project "${name}" created at ${dir}`, c.green);
  print(`\nFiles created:`, c.bold);
  print(`  📄 rules.json       — sample rules`);
  print(`  📄 index.js          — entry point`);
  print(`  📄 .env.example      — environment template`);
  print(`  📁 data/             — audit log directory`);
  print(`\nNext: cd ${name} && npm install @mizan/sdk`, c.cyan);
}

function cmdValidate(file) {
  if (!file) { print('Usage: mizan validate <rules.json>', c.red); process.exit(1); }
  console.log(logo);

  const { RuleEngine } = require('../dist/RuleEngine');
  const rules = JSON.parse(fs.readFileSync(path.resolve(file), 'utf-8'));

  print(`\n📋 Validating ${rules.length} rules...`, c.cyan);

  const engine = new RuleEngine();
  engine.loadRules(rules);
  const conflicts = engine.detectConflicts();

  for (const rule of rules) {
    const hasId = !!rule.id;
    const hasCondition = !!rule.condition;
    const hasAction = ['APPROVED', 'REJECTED', 'REVIEW'].includes(rule.action);
    const ok = hasId && hasCondition && hasAction;
    print(`  ${ok ? '✅' : '❌'} ${rule.id || '??'}: ${rule.name || 'unnamed'}${ok ? '' : ' — INVALID'}`, ok ? c.green : c.red);
  }

  if (conflicts.length > 0) {
    print(`\n⚠️  ${conflicts.length} conflict(s) found:`, c.yellow);
    for (const cf of conflicts) print(`  ⚡ ${cf.description}`, c.yellow);
  } else {
    print(`\n✅ No conflicts found`, c.green);
  }
}

function cmdDecide(rulesFile, factsFile) {
  if (!rulesFile || !factsFile) { print('Usage: mizan decide <rules.json> <facts.json>', c.red); process.exit(1); }
  console.log(logo);

  const { RuleEngine } = require('../dist/RuleEngine');
  const { AuditLogger } = require('../dist/AuditLogger');

  const rules = JSON.parse(fs.readFileSync(path.resolve(rulesFile), 'utf-8'));
  const facts = JSON.parse(fs.readFileSync(path.resolve(factsFile), 'utf-8'));

  const engine = new RuleEngine();
  engine.loadRules(rules);
  const decision = engine.evaluate(facts);

  const logger = new AuditLogger();
  logger.log(decision, facts);

  const colorMap = { APPROVED: c.green, REJECTED: c.red, REVIEW: c.yellow };
  print(`\n📊 Decision Result:`, c.bold);
  print(`  Result:  ${decision.result}`, colorMap[decision.result] || '');
  print(`  Score:   ${decision.score}`);
  print(`  Reason:  ${decision.reason}`);
  print(`  Rule:    ${decision.matchedRule?.name || 'None'}`);
  print(`  AuditID: ${decision.auditId}`, c.gray);
}

async function cmdParse(file) {
  if (!file) { print('Usage: mizan parse <policy.txt>', c.red); process.exit(1); }
  console.log(logo);

  const { PolicyParser } = require('../dist/PolicyParser');
  const parser = new PolicyParser(); // no adapter = regex fallback
  const rules = await parser.parseFile(path.resolve(file));

  print(`\n📜 Extracted ${rules.length} rules:\n`, c.cyan);
  console.log(JSON.stringify(rules, null, 2));
}

main().catch(err => {
  print(`Error: ${err.message}`, c.red);
  process.exit(1);
});
