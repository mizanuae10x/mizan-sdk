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
app.post('/api/demo/load', (req, res) => {
  try {
    const demo = JSON.parse(fs.readFileSync(DEMO_FILE, 'utf8'));
    writeJSON(RULES_FILE, demo);
    return res.json({ success: true, rulesLoaded: demo.length });
  } catch (e) { return res.status(500).json({ error: e.message }); }
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

// ---- AGENTS ----
app.get('/api/agents', (req, res) => res.json(readJSON(AGENTS_FILE)));

app.listen(PORT, () => {
  console.log(`\x1b[33m⚖️  Mizan Studio running on http://localhost:${PORT}\x1b[0m`);
});
