#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const readline = require('readline');

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

const VERSION = require('../package.json').version;
const logo = `${c.yellow}⚖️  Mizan SDK v${VERSION}${c.reset}`;

function print(msg, color = '') { console.log(`${color}${msg}${c.reset}`); }

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'init': return cmdInit(args[0]);
    case 'validate': return cmdValidate(args[0]);
    case 'decide': return cmdDecide(args[0], args[1]);
    case 'parse': return cmdParse(args[0]);
    case 'setup': return cmdSetup();
    case 'doctor': return cmdDoctor();
    case 'studio': return cmdStudio();
    case 'help': case '--help': case undefined: return cmdHelp();
    default:
      print(`Unknown command: ${command}`, c.red);
      cmdHelp();
      process.exit(1);
  }
}

function cmdStudio() {
  const { spawn, exec: execCmd } = require('child_process');
  const studioPath = path.join(__dirname, '..', 'studio', 'server.js');
  if (!fs.existsSync(studioPath)) {
    print('Studio not found at ' + studioPath, c.red);
    process.exit(1);
  }
  console.log(`${c.yellow}⚖️  Starting Mizan Studio...${c.reset}`);
  console.log(`${c.cyan} → http://localhost:4000${c.reset}\n`);
  const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execCmd(`${openCmd} http://localhost:4000`);
  const server = spawn('node', [studioPath], { stdio: 'inherit' });
  server.on('error', (e) => print('Studio error: ' + e.message, c.red));
}

function cmdHelp() {
  console.log(logo);
  console.log(`
${c.bold}Usage:${c.reset} mizan <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}init${c.reset} <name>            Create a new Mizan project
  ${c.cyan}setup${c.reset}                  Interactive environment setup
  ${c.cyan}doctor${c.reset}                 Check environment health
  ${c.cyan}studio${c.reset}                 Launch Mizan Studio (web dashboard)
  ${c.cyan}validate${c.reset} <rules.json>  Validate rules for conflicts
  ${c.cyan}decide${c.reset} <rules> <facts> Run engine and print decision
  ${c.cyan}parse${c.reset} <policy.txt>     Extract rules from policy text
  ${c.cyan}help${c.reset}                   Show this help message
`);
}

async function cmdSetup() {
  console.log(logo);
  print('\n🔧 Mizan SDK Setup Wizard\n', c.bold);

  const envPath = path.resolve('.env');
  const examplePath = path.resolve('.env.example');

  // Find .env.example from package if not local
  let exampleContent = '';
  const pkgExample = path.join(__dirname, '..', '.env.example');
  if (fs.existsSync(examplePath)) {
    exampleContent = fs.readFileSync(examplePath, 'utf8');
    print('  ✅ .env.example found locally', c.green);
  } else if (fs.existsSync(pkgExample)) {
    exampleContent = fs.readFileSync(pkgExample, 'utf8');
    fs.writeFileSync(examplePath, exampleContent);
    print('  ✅ Copied .env.example from SDK package', c.green);
  } else {
    print('  ⚠️  No .env.example found, creating basic one', c.yellow);
    exampleContent = 'OPENAI_API_KEY=\nANTHROPIC_API_KEY=\nMIZAN_DEFAULT_MODEL=gpt-4o-mini\n';
    fs.writeFileSync(examplePath, exampleContent);
  }

  // Load existing .env or start from example
  let envVars = {};
  if (fs.existsSync(envPath)) {
    print('  ✅ .env file exists', c.green);
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) envVars[m[1]] = m[2];
    }
  } else {
    print('  📝 Creating .env from template', c.cyan);
  }

  // Prompt for keys
  print('\n📋 Configure your API keys:\n', c.bold);

  const openaiKey = await ask(`  OpenAI API Key [${envVars.OPENAI_API_KEY ? '****' + envVars.OPENAI_API_KEY.slice(-4) : 'empty'}]: `);
  if (openaiKey) envVars.OPENAI_API_KEY = openaiKey;

  const anthropicKey = await ask(`  Anthropic API Key [${envVars.ANTHROPIC_API_KEY ? '****' + envVars.ANTHROPIC_API_KEY.slice(-4) : 'empty'}]: `);
  if (anthropicKey) envVars.ANTHROPIC_API_KEY = anthropicKey;

  const model = await ask(`  Default Model [${envVars.MIZAN_DEFAULT_MODEL || 'gpt-4o-mini'}]: `);
  if (model) envVars.MIZAN_DEFAULT_MODEL = model;

  // Write .env
  const envContent = Object.entries({ ...parseEnvExample(exampleContent), ...envVars })
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(envPath, envContent + '\n');
  print('\n  ✅ .env saved', c.green);

  // Validate keys
  print('\n🔍 Validating keys...\n', c.bold);

  if (envVars.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${envVars.OPENAI_API_KEY}` },
      });
      print(`  ${res.ok ? '✅' : '❌'} OpenAI API key ${res.ok ? 'valid' : 'invalid (' + res.status + ')'}`, res.ok ? c.green : c.red);
    } catch (e) {
      print(`  ❌ OpenAI: ${e.message}`, c.red);
    }
  } else {
    print('  ⏭️  OpenAI key not set (skipped)', c.gray);
  }

  if (envVars.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': envVars.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      const ok = res.status !== 401;
      print(`  ${ok ? '✅' : '❌'} Anthropic API key ${ok ? 'valid' : 'invalid'}`, ok ? c.green : c.red);
    } catch (e) {
      print(`  ❌ Anthropic: ${e.message}`, c.red);
    }
  } else {
    print('  ⏭️  Anthropic key not set (skipped)', c.gray);
  }

  print('\n✅ Setup complete! Run `mizan doctor` to verify.\n', c.green);
}

function parseEnvExample(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*?)(\s*#.*)?$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

async function cmdDoctor() {
  console.log(logo);
  print('\n⚖️  Mizan SDK Doctor', c.bold);
  print('──────────────────────\n');

  let allGood = true;

  // Node version
  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split('.')[0]);
  const nodeOk = nodeMajor >= 18;
  print(`  ${nodeOk ? '✅' : '❌'} Node.js v${nodeVer}${nodeOk ? '' : ' (need >=18)'}`, nodeOk ? c.green : c.red);
  if (!nodeOk) allGood = false;

  // .env file
  const envExists = fs.existsSync(path.resolve('.env'));
  print(`  ${envExists ? '✅' : '❌'} .env file ${envExists ? 'found' : 'not found'}`, envExists ? c.green : c.red);
  if (!envExists) allGood = false;

  // Load .env
  let envVars = {};
  if (envExists) {
    for (const line of fs.readFileSync(path.resolve('.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) envVars[m[1]] = m[2];
    }
  }

  // OpenAI key
  const hasOpenai = !!(envVars.OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  print(`  ${hasOpenai ? '✅' : '❌'} OpenAI API key ${hasOpenai ? 'configured' : 'not set (optional)'}`, hasOpenai ? c.green : c.yellow);

  // Anthropic key
  const hasAnthropic = !!(envVars.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
  print(`  ${hasAnthropic ? '✅' : '❌'} Anthropic API key ${hasAnthropic ? 'configured' : 'not set (optional)'}`, hasAnthropic ? c.green : c.yellow);

  if (!hasOpenai && !hasAnthropic) {
    print(`  ⚠️  No LLM provider configured — add at least one API key`, c.yellow);
    allGood = false;
  }

  // Audit directory
  const auditPath = envVars.MIZAN_AUDIT_PATH || './data/audit.jsonl';
  const auditDir = path.dirname(path.resolve(auditPath));
  let auditOk = false;
  try {
    fs.mkdirSync(auditDir, { recursive: true });
    fs.accessSync(auditDir, fs.constants.W_OK);
    auditOk = true;
  } catch {}
  print(`  ${auditOk ? '✅' : '❌'} Audit directory writable (${auditDir})`, auditOk ? c.green : c.red);
  if (!auditOk) allGood = false;

  // Memory directory
  const memPath = envVars.MIZAN_MEMORY_PATH || './data/memory.json';
  const memDir = path.dirname(path.resolve(memPath));
  let memOk = false;
  try {
    fs.mkdirSync(memDir, { recursive: true });
    fs.accessSync(memDir, fs.constants.W_OK);
    memOk = true;
  } catch {}
  print(`  ${memOk ? '✅' : '❌'} Memory directory writable (${memDir})`, memOk ? c.green : c.red);
  if (!memOk) allGood = false;

  print('\n──────────────────────');
  print(`  Status: ${allGood ? 'Ready to build ✅' : 'Issues found ⚠️'}`, allGood ? c.green : c.yellow);
  print('');
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

  // Copy .env.example
  const pkgExample = path.join(__dirname, '..', '.env.example');
  if (fs.existsSync(pkgExample)) {
    fs.copyFileSync(pkgExample, path.join(dir, '.env.example'));
  }

  fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify(rules, null, 2));
  fs.writeFileSync(path.join(dir, 'index.js'), `const { MizanAgent, webSearchTool, calculatorTool, autoDetectAdapter } = require('@mizan/sdk');

class MyAgent extends MizanAgent {
  async think(input) {
    if (this.adapter) {
      return this.adapter.complete(JSON.stringify(input));
    }
    return JSON.stringify({ result: 'processed', input });
  }
}

async function main() {
  const agent = new MyAgent({ adapter: autoDetectAdapter() });
  agent.registerTool(webSearchTool).registerTool(calculatorTool);

  const result = await agent.run({ score: 85, topic: 'UAE AI strategy' });
  console.log('Output:', result.output);
  console.log('Decisions:', result.decisions.length);
}

main().catch(console.error);
`);

  print(`\n✅ Project "${name}" created at ${dir}`, c.green);
  print(`\nFiles created:`, c.bold);
  print(`  📄 rules.json        — sample rules`);
  print(`  📄 index.js          — entry point`);
  print(`  📄 .env.example      — environment template`);
  print(`  📁 data/             — audit & memory directory`);
  print(`\nNext steps:`, c.cyan);
  print(`  cd ${name}`);
  print(`  npm install @mizan/sdk`);
  print(`  cp .env.example .env`);
  print(`  npx mizan setup`);
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
  const parser = new PolicyParser();
  const rules = await parser.parseFile(path.resolve(file));

  print(`\n📜 Extracted ${rules.length} rules:\n`, c.cyan);
  console.log(JSON.stringify(rules, null, 2));
}

main().catch(err => {
  print(`Error: ${err.message}`, c.red);
  process.exit(1);
});
