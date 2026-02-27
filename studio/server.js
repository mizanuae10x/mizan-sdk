const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

const DATA_DIR = path.join(__dirname, 'data');
const RULES_FILE = path.join(DATA_DIR, 'rules.json');
const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');
const DEMO_FILE = path.join(DATA_DIR, 'demo.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function genId() {
  return 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---- RULES CRUD ----
app.get('/api/rules', (req, res) => res.json(readJSON(RULES_FILE)));

app.post('/api/rules', (req, res) => {
  const rules = readJSON(RULES_FILE);
  const rule = { id: genId(), ...req.body, active: req.body.active !== false };
  rules.push(rule);
  writeJSON(RULES_FILE, rules);
  res.status(201).json(rule);
});

app.put('/api/rules/:id', (req, res) => {
  const rules = readJSON(RULES_FILE);
  const idx = rules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });
  rules[idx] = { ...rules[idx], ...req.body, id: req.params.id };
  writeJSON(RULES_FILE, rules);
  res.json(rules[idx]);
});

app.delete('/api/rules/:id', (req, res) => {
  let rules = readJSON(RULES_FILE);
  const len = rules.length;
  rules = rules.filter(r => r.id !== req.params.id);
  if (rules.length === len) return res.status(404).json({ error: 'Rule not found' });
  writeJSON(RULES_FILE, rules);
  res.json({ success: true });
});

// ---- DECIDE ----
app.post('/api/decide', (req, res) => {
  const { facts } = req.body;
  if (!facts || typeof facts !== 'object') return res.status(400).json({ error: 'Provide facts object' });

  const rules = readJSON(RULES_FILE).filter(r => r.active);
  rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let matched = null;
  for (const rule of rules) {
    try {
      const keys = Object.keys(facts);
      const vals = Object.values(facts);
      const fn = new Function(...keys, `return (${rule.condition})`);
      if (fn(...vals)) { matched = rule; break; }
    } catch { }
  }

  const decision = {
    id: 'd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    facts,
    decision: matched ? matched.action : 'REVIEW',
    matchedRule: matched ? matched.id : null,
    ruleName: matched ? matched.name : 'No matching rule',
    reason: matched ? matched.reason : 'No active rule matched — flagged for manual review'
  };

  const decisions = readJSON(DECISIONS_FILE);
  decisions.push(decision);
  writeJSON(DECISIONS_FILE, decisions);
  res.json(decision);
});

// ---- DECISIONS LOG ----
app.get('/api/decisions', (req, res) => res.json(readJSON(DECISIONS_FILE)));

// ---- CONFLICTS ----
app.get('/api/conflicts', (req, res) => {
  const rules = readJSON(RULES_FILE).filter(r => r.active);
  const conflicts = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i], b = rules[j];
      if (a.condition.trim().toLowerCase() === b.condition.trim().toLowerCase() && a.action !== b.action) {
        conflicts.push({ type: 'contradictory', rules: [a.id, b.id], ruleNames: [a.name, b.name], explanation: `"${a.name}" and "${b.name}" have same condition but different actions (${a.action} vs ${b.action})` });
      }
      if (a.condition.trim().toLowerCase() === b.condition.trim().toLowerCase() && a.action === b.action) {
        conflicts.push({ type: 'duplicate', rules: [a.id, b.id], ruleNames: [a.name, b.name], explanation: `"${a.name}" and "${b.name}" appear to be duplicates` });
      }
    }
  }
  res.json(conflicts);
});

// ---- DEMO ----
const DEMO_RULES = [
  {"id":"d1","name":"Budget Threshold","condition":"budget >= 100000","action":"APPROVED","reason":"Budget meets minimum threshold","priority":1,"active":true},
  {"id":"d2","name":"Unauthorized Vendor","condition":"vendor_blacklisted == true","action":"REJECTED","reason":"Vendor is on the blacklist","priority":0,"active":true},
  {"id":"d3","name":"Foreign Entity Review","condition":"entity_type == 'foreign'","action":"REVIEW","reason":"Foreign entities require additional review","priority":2,"active":true},
  {"id":"d4","name":"Emergency Fast-Track","condition":"priority == 'emergency' && budget <= 500000","action":"APPROVED","reason":"Emergency procurement fast-tracked","priority":1,"active":true},
  {"id":"d5","name":"High Risk Amount","condition":"budget >= 10000000","action":"REVIEW","reason":"High-value transaction requires board approval","priority":2,"active":true}
];
app.post('/api/demo/load', (req, res) => {
  writeJSON(RULES_FILE, DEMO_RULES);
  res.json({ success: true, rulesLoaded: DEMO_RULES.length });
});

// ---- STATS ----
app.get('/api/stats', (req, res) => {
  const rules = readJSON(RULES_FILE);
  const decisions = readJSON(DECISIONS_FILE);
  const today = new Date().toISOString().slice(0, 10);
  const decisionsToday = decisions.filter(d => d.timestamp && d.timestamp.startsWith(today)).length;
  const agents = readJSON(AGENTS_FILE);
  res.json({ rulesCount: rules.length, decisionsToday, auditEntries: decisions.length, agentsRunning: agents.filter(a => a.status === 'running').length });
});

// ---- ENV ----
app.get('/api/env', (req, res) => {
  const envPath = path.join(__dirname, '..', '.env');
  const vars = [
    { key: 'OPENAI_API_KEY', desc: 'OpenAI API Key' },
    { key: 'ANTHROPIC_API_KEY', desc: 'Anthropic API Key' },
    { key: 'MIZAN_AUDIT_PATH', desc: 'Audit log file path' },
    { key: 'MIZAN_MEMORY_PATH', desc: 'Memory storage path' },
    { key: 'MIZAN_DEFAULT_MODEL', desc: 'Default LLM model' }
  ];
  let envContent = {};
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) envContent[m[1].trim()] = m[2].trim();
    }
  } catch {}
  const result = vars.map(v => {
    const val = envContent[v.key] || process.env[v.key] || '';
    const masked = val && (v.key.includes('KEY') || v.key.includes('SECRET'))
      ? val.slice(0, 4) + '****' + val.slice(-4)
      : val;
    return { key: v.key, description: v.desc, value: masked, isSet: !!val };
  });
  res.json(result);
});

app.post('/api/env', (req, res) => {
  const envPath = path.join(__dirname, '..', '.env');
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  let lines = [];
  try { lines = fs.readFileSync(envPath, 'utf8').split('\n'); } catch {}
  let found = false;
  lines = lines.map(l => {
    if (l.startsWith(key + '=')) { found = true; return `${key}=${value}`; }
    return l;
  });
  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(envPath, lines.join('\n'));
  res.json({ success: true });
});

app.post('/api/test-connection', async (req, res) => {
  const { provider } = req.body;
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = {};
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const l of lines) { const m = l.match(/^([^#=]+)=(.*)$/); if (m) envContent[m[1].trim()] = m[2].trim(); }
  } catch {}

  if (provider === 'openai') {
    const key = envContent.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) return res.json({ success: false, error: 'No API key set' });
    try {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      res.json({ success: r.ok, status: r.status });
    } catch (e) { res.json({ success: false, error: e.message }); }
  } else if (provider === 'anthropic') {
    const key = envContent.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return res.json({ success: false, error: 'No API key set' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      });
      res.json({ success: r.ok || r.status === 400, status: r.status });
    } catch (e) { res.json({ success: false, error: e.message }); }
  } else {
    res.status(400).json({ error: 'Unknown provider' });
  }
});

// ---- AGENTS CRUD ----
const PROJECT_DIR = path.resolve(process.env.MIZAN_PROJECT_DIR || path.join(__dirname, '..', '..'));

app.get('/api/agents', (req, res) => res.json(readJSON(AGENTS_FILE)));

app.post('/api/agents', (req, res) => {
  const agents = readJSON(AGENTS_FILE);
  const { name, type, description, model, tools, rules, systemPrompt } = req.body;
  if (!name) return res.status(400).json({ error: 'Agent name required' });

  const id = 'agent-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
  const filename = safeName + '-' + Date.now().toString(36) + '.js';

  // Build agent JS file
  const toolImports = (tools || []).map(t => t).join(', ');
  const toolRegistrations = (tools || []).map(t => `  agent.registerTool(${t});`).join('\n');
  const rulesJSON = JSON.stringify(rules || [], null, 4);

  const thinkBody = buildThinkBody(type, tools);

  const agentCode = `require('dotenv').config();
const { MizanAgent, ${toolImports ? toolImports + ', ' : ''}autoDetectAdapter } = require('@mizan/sdk');

// Agent: ${name}
// Type: ${type || 'custom'}
// ${description || ''}

const RULES = ${rulesJSON};

class ${toPascalCase(name)}Agent extends MizanAgent {
  async think(input) {
${thinkBody}
  }
}

async function main() {
  const agent = new ${toPascalCase(name)}Agent({
    adapter: autoDetectAdapter(),
    rules: RULES
  });

${toolRegistrations}

  // Run the agent
  const result = await agent.run(input || { query: 'Hello' });
  console.log('\\n--- Agent Output ---');
  console.log(result.output);
  console.log('\\n--- Decisions ---');
  result.decisions.forEach(d => {
    console.log(\`  [\${d.result}] \${d.reason}\`);
  });
}

// Accept input from command line or use default
const input = process.argv[2] ? JSON.parse(process.argv[2]) : undefined;
main().catch(console.error);
`;

  // Write agent file to project root
  const AGENTS_DIR = path.resolve(process.env.MIZAN_AGENTS_PATH || path.join(PROJECT_DIR, 'agents'));
  const filePath = path.join(AGENTS_DIR, filename);
  // Security: ensure file stays within agents dir
  if (!filePath.startsWith(AGENTS_DIR)) return res.status(400).json({ error: 'Invalid agent path' });
  const agentsDir = AGENTS_DIR;
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(filePath, agentCode);

  // Validate rule conditions — only allow safe expressions
  const SAFE_CONDITION_RE = /^[\w\s\d\.\[\]'"<>=!&|().,+\-*/]+$/;
  for (const rule of (rules || [])) {
    if (rule.condition && !SAFE_CONDITION_RE.test(rule.condition)) {
      return res.status(400).json({ error: `Invalid condition in rule "${rule.name}": only alphanumeric and basic operators allowed` });
    }
  }

  const agent = {
    id, name, type: type || 'custom', description: description || '',
    model: model || 'gpt-4o-mini', tools: tools || [], rules: rules || [],
    systemPrompt: systemPrompt || '', filename, filePath,
    status: 'idle', decisions: 0, lastActivity: null, createdAt: new Date().toISOString()
  };
  agents.push(agent);
  writeJSON(AGENTS_FILE, agents);
  res.status(201).json(agent);
});

app.delete('/api/agents/:id', (req, res) => {
  let agents = readJSON(AGENTS_FILE);
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  // Remove file
  try {
    const AGENTS_DIR = path.resolve(process.env.MIZAN_AGENTS_PATH || path.join(PROJECT_DIR, 'agents'));
    const delPath = path.join(AGENTS_DIR, path.basename(agent.filename));
    if (delPath.startsWith(AGENTS_DIR) && fs.existsSync(delPath)) {
      fs.unlinkSync(delPath);
    }
  } catch {}
  agents = agents.filter(a => a.id !== req.params.id);
  writeJSON(AGENTS_FILE, agents);
  res.json({ success: true });
});

app.post('/api/agents/:id/run', async (req, res) => {
  const agents = readJSON(AGENTS_FILE);
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const filePath = path.join(PROJECT_DIR, 'agents', agent.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Agent file not found' });

  const inputData = req.body.input || { query: 'test' };
  const { execFile } = require('child_process');
  try {
    const output = await new Promise((resolve, reject) => {
      execFile('node', [filePath, JSON.stringify(inputData)], {
        cwd: PROJECT_DIR, timeout: 15000, encoding: 'utf8',
        env: { ...process.env }
      }, (err, stdout, stderr) => {
        if (err && !stdout) return reject(err);
        resolve(stdout || stderr);
      });
    });
    // Update agent stats
    const idx = agents.findIndex(a => a.id === req.params.id);
    agents[idx].decisions = (agents[idx].decisions || 0) + 1;
    agents[idx].lastActivity = new Date().toISOString();
    agents[idx].status = 'idle';
    writeJSON(AGENTS_FILE, agents);
    res.json({ success: true, output: output.trim() });
  } catch (e) {
    res.json({ success: false, error: e.stderr || e.message, output: e.stdout || '' });
  }
});

app.get('/api/agents/:id/code', (req, res) => {
  const agents = readJSON(AGENTS_FILE);
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const filePath = path.join(PROJECT_DIR, 'agents', agent.filename);
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    res.json({ code, filename: agent.filename });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

function toPascalCase(str) {
  return str.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function buildThinkBody(type, tools) {
  switch (type) {
    case 'research':
      return `    // Research agent: search and analyze
    const search = await this.useTool('web_search', { query: input.query || input.topic });
    if (this.adapter) {
      const prompt = \`Analyze this research topic: \${input.query || input.topic}\\n\\nSearch results: \${JSON.stringify(search.data)}\\n\\nProvide a clear summary.\`;
      return await this.adapter.complete(prompt);
    }
    return \`Research results: \${JSON.stringify(search.data)}\`;`;
    case 'governance':
      return `    // Governance agent: evaluate against rules
    if (this.adapter) {
      const prompt = \`You are a governance agent. Evaluate this request based on the rules and facts provided.\\n\\nFacts: \${JSON.stringify(input)}\\n\\nProvide your assessment.\`;
      return await this.adapter.complete(prompt);
    }
    return JSON.stringify({ assessed: true, input });`;
    case 'chat':
      return `    // Chat agent: conversational with memory
    const memories = this.recall(input.message || input.query || '', 3);
    const context = memories.length ? '\\nRelevant context: ' + memories.map(m => m.content).join('; ') : '';
    if (this.adapter) {
      const prompt = \`\${input.message || input.query}\${context}\`;
      const response = await this.adapter.complete(prompt);
      this.remember(input.message || input.query, ['conversation']);
      return response;
    }
    return 'No LLM adapter configured';`;
    case 'compliance':
      return `    // Compliance agent: check policies
    if (this.adapter) {
      const prompt = \`You are a compliance officer. Review the following for regulatory compliance:\\n\\n\${JSON.stringify(input)}\\n\\nIdentify any compliance issues and provide recommendations.\`;
      return await this.adapter.complete(prompt);
    }
    return JSON.stringify({ compliant: true, input });`;
    case 'data':
      return `    // Data agent: analyze and process
    const calc = input.expression ? await this.useTool('calculate', { expression: input.expression }) : null;
    if (this.adapter) {
      const prompt = \`Analyze this data:\\n\${JSON.stringify(input)}\${calc ? '\\nCalculation: ' + JSON.stringify(calc.data) : ''}\\n\\nProvide insights.\`;
      return await this.adapter.complete(prompt);
    }
    return JSON.stringify({ analyzed: true, calculation: calc?.data, input });`;
    default:
      return `    // Custom agent logic
    if (this.adapter) {
      return await this.adapter.complete(JSON.stringify(input));
    }
    return JSON.stringify({ processed: true, input });`;
  }
}

app.listen(PORT, () => {
  console.log(`\x1b[33m⚖️  Mizan Studio running on http://localhost:${PORT}\x1b[0m`);
});
