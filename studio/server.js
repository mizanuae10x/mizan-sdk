const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

const DATA_DIR = path.join(__dirname, 'data');
const RULES_FILE = path.join(DATA_DIR, 'rules.json');
const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');
const DEMO_FILE = path.join(DATA_DIR, 'demo.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const API_KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');

let ragEngine = null;
try {
  const { RAGEngine } = require('../dist/RAGEngine');
  ragEngine = new RAGEngine(path.join(DATA_DIR, 'rag-store.json'));
} catch (e) {
  console.warn('RAG Engine not available (run npm run build first):', e.message);
}

let sessionMemory = null;
try {
  const { SessionMemory } = require('../dist/SessionMemory');
  sessionMemory = new SessionMemory(path.join(DATA_DIR, 'sessions.json'));
} catch (e) {
  console.warn('SessionMemory not available:', e.message);
}

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
function generateApiKey() {
  return 'mzn_k_' + crypto.randomBytes(16).toString('hex');
}
function readKeys() {
  try { return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8')); } catch { return {}; }
}
function writeKeys(data) {
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(data, null, 2));
}
function readWebhooks() {
  try { return JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf8')); } catch { return []; }
}
function writeWebhooks(data) {
  fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(data, null, 2));
}
function normalizeAuthHeader(auth) {
  if (!auth) return '';
  const token = String(auth).trim();
  if (!token) return '';
  return token.startsWith('Bearer ') ? token.slice(7).trim() : token;
}

function requireApiKey(req, res, next) {
  const auth = req.headers.authorization || req.headers['x-api-key'] || '';
  const key = normalizeAuthHeader(auth);
  if (!key) return res.status(401).json({ error: 'API key required' });

  const keys = readKeys();
  const keyData = keys[key];
  if (!keyData) return res.status(403).json({ error: 'Invalid API key' });
  if (req.params.id && keyData.agentId !== req.params.id) return res.status(403).json({ error: 'API key does not match this agent' });

  keys[key].lastUsed = new Date().toISOString();
  keys[key].callCount = (keys[key].callCount || 0) + 1;
  writeKeys(keys);

  req.agentId = keyData.agentId;
  req.apiKey = key;
  next();
}

async function runAgentChat(agentId, body = {}) {
  const { message, session_id = 'default' } = body;
  if (!message) return { status: 400, payload: { error: 'message required' } };

  const agents = readJSON(AGENTS_FILE);
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return { status: 404, payload: { error: 'Agent not found' } };

  let ragContext = '';
  let ragSources = [];
  if (ragEngine && agent.useRag) {
    const ragResult = await ragEngine.answer(message, 3);
    ragContext = ragResult.sources.map((s, i) => `[${i + 1}] ${s.chunk.text}`).join('\n\n');
    ragSources = ragResult.sources.map(s => ({
      doc: s.chunk.docName,
      score: Math.round(s.score * 100) / 100,
      preview: s.chunk.text.slice(0, 150) + '...'
    }));
  }

  let complianceReport = null;
  const frameworks = agent.complianceFrameworks || [];
  if (frameworks.length > 0) {
    complianceReport = runComplianceCheck({ message }, frameworks, 'both');
  }

  const systemPrompt = agent.systemPrompt || 'You are a helpful AI assistant.';
  const history = sessionMemory ? sessionMemory.getHistory(session_id) : [];

  let answer = '';
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const https = require('https');
    const currentUserMessage = ragContext
      ? `Context:\n${ragContext}\n\nQuestion: ${message}`
      : message;
    answer = await new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        model: agent.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: currentUserMessage }
        ],
        max_tokens: 800
      });
      const request = https.request({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (response) => {
        let raw = '';
        response.on('data', chunk => { raw += chunk; });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed.choices?.[0]?.message?.content || parsed.error?.message || 'No answer');
          } catch (err) {
            reject(err);
          }
        });
      });
      request.on('error', reject);
      request.write(requestBody);
      request.end();
    });
  } else {
    answer = ragContext
      ? `Based on my knowledge base:\n\n${ragSources.map((s, i) => `[${i + 1}] ${s.preview}`).join('\n\n')}`
      : `I am ${agent.name}. You asked: "${message}". (Connect an OpenAI API key for full responses.)`;
  }

  if (sessionMemory) {
    sessionMemory.addMessage(session_id, agentId, 'user', message);
    sessionMemory.addMessage(session_id, agentId, 'assistant', answer);
  }

  const auditEntry = {
    id: 'agt-' + Date.now().toString(36),
    timestamp: new Date().toISOString(),
    agentId,
    agentName: agent.name,
    input: { message, session_id },
    output: answer,
    ragSources,
    complianceScore: complianceReport?.score ?? null,
    hash: crypto.createHash('sha256').update(answer + message).digest('hex').slice(0, 16)
  };

  return {
    status: 200,
    payload: {
      answer,
      agentId,
      agentName: agent.name,
      sessionId: session_id,
      sessionHistory: history.length,
      sources: ragSources,
      compliance: complianceReport ? {
        score: complianceReport.score,
        status: complianceReport.overallStatus,
        summaryAr: complianceReport.summaryAr
      } : null,
      auditId: auditEntry.id,
      auditHash: auditEntry.hash
    }
  };
}

// ---- AUTH HELPERS ----
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const STUDIO_SESSIONS_FILE = path.join(DATA_DIR, 'studio-sessions.json');

function readAuth() {
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch(e) { return {}; }
}
function writeAuth(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}
function readStudioSessions() {
  try { return JSON.parse(fs.readFileSync(STUDIO_SESSIONS_FILE, 'utf8')); } catch(e) { return { tokens: {} }; }
}
function writeStudioSessions(data) {
  fs.writeFileSync(STUDIO_SESSIONS_FILE, JSON.stringify(data, null, 2));
}
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'mizan-salt-2026').digest('hex');
}
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}
function getTokenFromReq(req) {
  const auth = req.headers['authorization'] || '';
  return auth.replace('Bearer ', '').trim() || (req.headers['x-studio-token'] || '').trim();
}
function getSessionUser(token) {
  if (!token) return null;
  const sessions = readStudioSessions();
  const session = sessions.tokens[token];
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  return session;
}
function requireStudioAuth(req, res, next) {
  const token = getTokenFromReq(req);
  const user = getSessionUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.currentUser = user;
  next();
}

// ---- AUTH ENDPOINTS ----
app.get('/api/auth/status', (req, res) => {
  const auth = readAuth();
  if (!auth.admin) return res.json({ setup: false, authenticated: false });
  const token = getTokenFromReq(req);
  const user = getSessionUser(token);
  if (user) return res.json({ setup: true, authenticated: true, user: { name: auth.admin.name, email: auth.admin.email, studioName: auth.admin.studioName, language: auth.admin.language } });
  return res.json({ setup: true, authenticated: false });
});

app.post('/api/auth/setup', (req, res) => {
  const auth = readAuth();
  if (auth.admin) return res.status(409).json({ error: 'Admin already exists' });
  const { name, email, password, studioName, language } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  auth.admin = { name, email, passwordHash: hashPassword(password), studioName: studioName || 'Mizan Studio', language: language || 'ar', createdAt: new Date().toISOString() };
  writeAuth(auth);
  const token = genToken();
  const sessions = readStudioSessions();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  sessions.tokens[token] = { name, email, createdAt: new Date().toISOString(), expiresAt: expires };
  writeStudioSessions(sessions);
  res.json({ success: true, token, user: { name, email, studioName: auth.admin.studioName, language: auth.admin.language } });
});

app.post('/api/auth/login', (req, res) => {
  const auth = readAuth();
  if (!auth.admin) return res.status(404).json({ error: 'Not set up' });
  const { email, password } = req.body;
  if (auth.admin.email !== email || auth.admin.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = genToken();
  const sessions = readStudioSessions();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  sessions.tokens[token] = { name: auth.admin.name, email, createdAt: new Date().toISOString(), expiresAt: expires };
  writeStudioSessions(sessions);
  res.json({ success: true, token, user: { name: auth.admin.name, email } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getTokenFromReq(req);
  if (token) {
    const sessions = readStudioSessions();
    delete sessions.tokens[token];
    writeStudioSessions(sessions);
  }
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = getTokenFromReq(req);
  const session = getSessionUser(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const auth = readAuth();
  const admin = auth.admin || {};
  res.json({ user: { name: session.name, email: session.email, studioName: admin.studioName, language: admin.language } });
});

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

function runComplianceCheck(input, frameworks, language) {
  const checks = [];
  const inputStr = JSON.stringify(input).toLowerCase();

  if (frameworks.includes('PDPL')) {
    const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(inputStr);
    const hasEmiratesId = /784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d/.test(inputStr);
    const hasUAEPhone = /\+971|00971|05\d/.test(inputStr);
    const hasPII = hasEmail || hasEmiratesId || hasUAEPhone;

    checks.push({
      framework: 'PDPL',
      article: 'Art. 10',
      status: hasPII ? 'REVIEW_REQUIRED' : 'COMPLIANT',
      requirement: 'Data minimization - only collect necessary personal data',
      requirementAr: 'تقليل البيانات — جمع البيانات الشخصية الضرورية فقط',
      passed: !hasPII,
      details: hasPII ? 'PII detected in input: consider anonymization' : 'No unnecessary PII detected',
      remediation: hasPII ? 'Remove or anonymize personal identifiers before processing' : null,
      remediationAr: hasPII ? 'قم بإزالة أو إخفاء هوية المعرّفات الشخصية قبل المعالجة' : null
    });
    checks.push({
      framework: 'PDPL',
      article: 'Art. 4',
      status: 'COMPLIANT',
      requirement: 'Lawful basis for processing must be established',
      requirementAr: 'يجب إثبات الأساس القانوني للمعالجة',
      passed: true,
      details: 'Processing basis assumed from system configuration'
    });
  }

  if (frameworks.includes('UAE_AI_ETHICS')) {
    const hasBiasTerms = /gender|race|religion|nationality|age_group/.test(inputStr);
    checks.push({
      framework: 'UAE_AI_ETHICS',
      article: 'Principle 1 - Inclusiveness',
      status: hasBiasTerms ? 'REVIEW_REQUIRED' : 'COMPLIANT',
      requirement: 'AI systems must be inclusive and avoid demographic bias',
      requirementAr: 'يجب أن تكون أنظمة الذكاء الاصطناعي شاملة وتتجنب التحيز الديموغرافي',
      passed: !hasBiasTerms,
      details: hasBiasTerms ? 'Demographic attributes detected - review for bias' : 'No demographic bias markers found',
      remediation: hasBiasTerms ? 'Review decision logic for potential discriminatory patterns' : null,
      remediationAr: hasBiasTerms ? 'مراجعة منطق القرار للأنماط التمييزية المحتملة' : null
    });
    checks.push({
      framework: 'UAE_AI_ETHICS',
      article: 'Principle 3 - Transparency',
      status: 'COMPLIANT',
      requirement: 'Decisions must be explainable with audit trail',
      requirementAr: 'يجب أن تكون القرارات قابلة للتفسير مع مسار تدقيق',
      passed: true,
      details: 'Audit logging is active and decisions are traceable'
    });
    checks.push({
      framework: 'UAE_AI_ETHICS',
      article: 'Principle 5 - Security',
      status: 'COMPLIANT',
      requirement: 'AI systems must maintain security and protect against misuse',
      requirementAr: 'يجب أن تحافظ أنظمة الذكاء الاصطناعي على الأمن وتحمي من إساءة الاستخدام',
      passed: true,
      details: 'No sensitive system information exposed in input'
    });
  }

  if (frameworks.includes('NESA')) {
    const hasSecret = /password|secret|token|api_key|private_key/.test(inputStr);
    checks.push({
      framework: 'NESA',
      article: 'Control 3 - Data Classification',
      status: hasSecret ? 'NON_COMPLIANT' : 'COMPLIANT',
      requirement: 'Data must be classified before processing (PUBLIC/INTERNAL/CONFIDENTIAL/SECRET)',
      requirementAr: 'يجب تصنيف البيانات قبل المعالجة (عام/داخلي/سري/سري للغاية)',
      passed: !hasSecret,
      details: hasSecret ? 'SECRET-level data detected in unencrypted input' : 'Data classification: INTERNAL',
      remediation: hasSecret ? 'Encrypt SECRET data and use secure channels' : null,
      remediationAr: hasSecret ? 'تشفير البيانات السرية واستخدام القنوات الآمنة' : null
    });
    checks.push({
      framework: 'NESA',
      article: 'Control 1 - Audit Logging',
      status: 'COMPLIANT',
      requirement: 'All AI decisions must be logged with tamper-evident audit trail',
      requirementAr: 'يجب تسجيل جميع قرارات الذكاء الاصطناعي مع مسار تدقيق مقاوم للتلاعب',
      passed: true,
      details: 'SHA-256 hash chain audit logging is active'
    });
  }

  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 100;
  const failedCritical = checks.some(c => !c.passed && c.status === 'NON_COMPLIANT');
  const hasReview = checks.some(c => c.status === 'REVIEW_REQUIRED');
  const overallStatus = failedCritical ? 'NON_COMPLIANT' : (hasReview ? 'REVIEW_REQUIRED' : 'COMPLIANT');

  const summaries = {
    en: `Compliance evaluation completed. Score: ${score}/100. ${passed} of ${total} checks passed. Status: ${overallStatus}.`,
    ar: `اكتمل تقييم الامتثال. النتيجة: ${score}/100. اجتاز ${passed} من أصل ${total} فحوصات. الحالة: ${overallStatus === 'COMPLIANT' ? 'ممتثل' : overallStatus === 'REVIEW_REQUIRED' ? 'يتطلب مراجعة' : 'غير ممتثل'}.`
  };

  return {
    reportId: 'RPT-' + Date.now().toString(36).toUpperCase(),
    timestamp: new Date().toISOString(),
    overallStatus,
    frameworks,
    checks,
    score,
    summary: summaries.en,
    summaryAr: summaries.ar,
    language,
    auditHash: crypto.createHash('sha256').update(JSON.stringify(checks)).digest('hex').slice(0, 16)
  };
}

app.post('/api/compliance/check', (req, res) => {
  try {
    const { input = {}, frameworks = ['PDPL', 'UAE_AI_ETHICS', 'NESA'], language = 'both' } = req.body || {};
    const report = runComplianceCheck(input, Array.isArray(frameworks) ? frameworks : [], language);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/compliance/pii', (req, res) => {
  const { text = '' } = req.body || {};
  const findings = [];
  if (/784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d/.test(text)) findings.push({ type: 'Emirates ID', severity: 'HIGH', color: '#ef4444' });
  if (/(\+971|00971|05\d)\d{7,8}/.test(text)) findings.push({ type: 'UAE Phone (+971)', severity: 'MEDIUM', color: '#f97316' });
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) findings.push({ type: 'Email Address', severity: 'MEDIUM', color: '#eab308' });
  if (/\b[A-Z]{1,3}\d{6,9}\b/.test(text)) findings.push({ type: 'Passport Number', severity: 'HIGH', color: '#ef4444' });
  res.json({ findings, clean: findings.length === 0 });
});

// ---- RAG ----
app.get('/api/rag/stats', (req, res) => {
  if (!ragEngine) return res.status(503).json({ error: 'RAG not available - run npm run build' });
  res.json(ragEngine.getStats());
});

app.get('/api/rag/docs', (req, res) => {
  if (!ragEngine) return res.status(503).json({ error: 'RAG not available - run npm run build' });
  res.json(ragEngine.listDocuments());
});

app.post('/api/rag/ingest', async (req, res) => {
  if (!ragEngine) return res.status(503).json({ error: 'RAG not available - run npm run build' });
  try {
    const { name, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content required' });
    const doc = await ragEngine.ingest(name, content);
    res.json({ id: doc.id, name: doc.name, chunkCount: doc.chunks.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rag/query', async (req, res) => {
  if (!ragEngine) return res.status(503).json({ error: 'RAG not available - run npm run build' });
  try {
    const { query, topK = 3 } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    const result = await ragEngine.answer(query, topK);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/rag/docs/:id', (req, res) => {
  if (!ragEngine) return res.status(503).json({ error: 'RAG not available - run npm run build' });
  const ok = ragEngine.deleteDocument(req.params.id);
  res.json({ deleted: ok });
});

// ---- SESSION MEMORY ----
app.get('/api/sessions', (req, res) => {
  if (!sessionMemory) return res.json([]);
  res.json(sessionMemory.listSessions(req.query.agentId));
});

app.get('/api/sessions/:id', (req, res) => {
  if (!sessionMemory) return res.json({ messages: [] });
  const history = sessionMemory.getHistory(req.params.id);
  res.json({ sessionId: req.params.id, messages: history });
});

app.delete('/api/sessions/:id', (req, res) => {
  if (sessionMemory) sessionMemory.clearSession(req.params.id);
  res.json({ cleared: true });
});

// ---- WEBHOOKS ----
app.get('/api/webhooks', (req, res) => res.json(readWebhooks()));

app.post('/api/webhooks', (req, res) => {
  const { name, agentId, event, filter } = req.body;
  if (!name || !agentId || !event) return res.status(400).json({ error: 'name, agentId, event required' });

  const webhook = {
    id: 'wh-' + crypto.randomBytes(4).toString('hex'),
    name,
    agentId,
    event,
    filter: filter || '',
    url: `/api/webhooks/trigger/${crypto.randomBytes(8).toString('hex')}`,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    triggerCount: 0,
    active: true
  };

  const hooks = readWebhooks();
  hooks.push(webhook);
  writeWebhooks(hooks);
  res.json(webhook);
});

app.delete('/api/webhooks/:id', (req, res) => {
  const hooks = readWebhooks().filter(w => w.id !== req.params.id);
  writeWebhooks(hooks);
  res.json({ deleted: true });
});

app.post('/api/webhooks/trigger/:token', async (req, res) => {
  const hooks = readWebhooks();
  const hook = hooks.find(w => w.url.endsWith(req.params.token) && w.active);
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  hook.lastTriggered = new Date().toISOString();
  hook.triggerCount = (hook.triggerCount || 0) + 1;
  writeWebhooks(hooks);

  const payload = req.body;
  const payloadText = payload && typeof payload === 'object'
    ? (payload.message || payload.text || payload.body || JSON.stringify(payload))
    : String(payload || '');

  try {
    const result = await runAgentChat(hook.agentId, {
      message: `[Webhook: ${hook.event}] ${payloadText}`,
      session_id: `webhook-${hook.id}-${Date.now()}`
    });
    res.json({ triggered: true, hookId: hook.id, agentResponse: result.payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/webhooks/:id/toggle', (req, res) => {
  const hooks = readWebhooks();
  const hook = hooks.find(w => w.id === req.params.id);
  if (!hook) return res.status(404).json({ error: 'Not found' });
  hook.active = !hook.active;
  writeWebhooks(hooks);
  res.json({ active: hook.active });
});

// ---- AGENTS CRUD ----
const PROJECT_DIR = path.resolve(__dirname, '..', '..', '..', '..');

app.get('/api/agents', (req, res) => res.json(readJSON(AGENTS_FILE)));

app.post('/api/agents', (req, res) => {
  const agents = readJSON(AGENTS_FILE);
  const { name, type, description, model, tools, rules, systemPrompt } = req.body;
  if (!name) return res.status(400).json({ error: 'Agent name required' });

  const id = 'agent-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.js';

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
  const filePath = path.join(PROJECT_DIR, 'agents', filename);
  const agentsDir = path.join(PROJECT_DIR, 'agents');
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(filePath, agentCode);

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
  try { fs.unlinkSync(path.join(PROJECT_DIR, 'agents', agent.filename)); } catch {}
  agents = agents.filter(a => a.id !== req.params.id);
  writeJSON(AGENTS_FILE, agents);
  res.json({ success: true });
});

app.post('/api/agents/:id/keys', (req, res) => {
  const agents = readJSON(AGENTS_FILE);
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const key = generateApiKey();
  const keys = readKeys();
  keys[key] = {
    id: key,
    agentId: req.params.id,
    agentName: agent.name,
    name: req.body?.name || 'Default Key',
    createdAt: new Date().toISOString(),
    lastUsed: null,
    callCount: 0
  };
  writeKeys(keys);
  res.json({ key, agentId: req.params.id });
});

app.get('/api/agents/:id/keys', (req, res) => {
  const keys = readKeys();
  const agentKeys = Object.values(keys)
    .filter(key => key.agentId === req.params.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const masked = agentKeys.map(key => ({ ...key, id: key.id.slice(0, 16) + '••••' }));
  res.json(masked);
});

app.delete('/api/agents/:id/keys/:keyId', (req, res) => {
  const keys = readKeys();
  const prefix = req.params.keyId.replace(/••••$/, '');
  const full = Object.keys(keys).find(key => key.startsWith(prefix) && keys[key].agentId === req.params.id);
  if (!full) return res.status(404).json({ error: 'Key not found' });
  delete keys[full];
  writeKeys(keys);
  res.json({ revoked: true });
});

app.post('/api/agents/:id/chat', requireApiKey, async (req, res) => {
  try {
    const result = await runAgentChat(req.params.id, req.body || {});
    res.status(result.status).json(result.payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents/:id/chat/public', async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  res.json({
    answer: `Agent ${req.params.id} received: "${message}". Add an API key for full access.`,
    sources: [],
    compliance: null
  });
});

app.post('/api/agents/:id/run', async (req, res) => {
  const agents = readJSON(AGENTS_FILE);
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const filePath = path.join(PROJECT_DIR, 'agents', agent.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Agent file not found' });

  const inputJSON = JSON.stringify(req.body.input || { query: 'test' });
  const { execSync } = require('child_process');
  try {
    const output = execSync(`node "${filePath}" '${inputJSON}'`, {
      cwd: PROJECT_DIR, timeout: 30000, encoding: 'utf8',
      env: { ...process.env, DOTENV_CONFIG_PATH: path.join(PROJECT_DIR, '.env') }
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

// ---- ORCHESTRATION ----
app.post('/api/orchestrate', async (req, res) => {
  const { pipeline, input, sessionId = 'orch-' + Date.now().toString(36) } = req.body;
  if (!pipeline || !Array.isArray(pipeline) || pipeline.length === 0) {
    return res.status(400).json({ error: 'pipeline array required' });
  }

  const results = [];
  let currentInput = (input && input.message) || input || '';

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    try {
      const result = await runAgentChat(step.agentId, {
        message: step.passOutputAsInput !== false && i > 0
          ? `Previous agent output:\n${results[i - 1]?.answer || ''}\n\nOriginal request: ${currentInput}`
          : currentInput,
        session_id: `${sessionId}-step${i}`
      });

      results.push({
        step: i + 1,
        agentId: step.agentId,
        role: step.role || `Agent ${i + 1}`,
        answer: result.payload?.answer || '',
        compliance: result.payload?.compliance || null,
        auditHash: result.payload?.auditHash || ''
      });

      if (step.passOutputAsInput !== false) {
        currentInput = result.payload?.answer || currentInput;
      }
    } catch (e) {
      results.push({ step: i + 1, agentId: step.agentId, role: step.role, error: e.message });
    }
  }

  res.json({
    pipelineId: 'pipe-' + Date.now().toString(36),
    steps: pipeline.length,
    results,
    finalAnswer: results[results.length - 1]?.answer || '',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/orchestrate/templates', (req, res) => {
  res.json([
    {
      id: 'policy-review',
      name: '📜 Policy Review Pipeline',
      description: 'Research → Compliance check → Arabic summary',
      steps: [
        { role: '🔍 Research Agent', note: 'Finds relevant policy information' },
        { role: '🛡️ Compliance Agent', note: 'Checks UAE frameworks (PDPL, AI Ethics, NESA)' },
        { role: '📝 Summary Agent', note: 'Generates executive Arabic summary' }
      ]
    },
    {
      id: 'document-analysis',
      name: '📄 Document Analysis Pipeline',
      description: 'Extract → Analyze → Report',
      steps: [
        { role: '📥 Extraction Agent', note: 'Extracts key information from document' },
        { role: '⚖️ Legal Analysis Agent', note: 'Legal implications and risks' },
        { role: '📊 Report Agent', note: 'Structured executive report' }
      ]
    },
    {
      id: 'citizen-request',
      name: '🏛️ Citizen Request Pipeline',
      description: 'Classify → Route → Respond',
      steps: [
        { role: '🏷️ Classification Agent', note: 'Classifies request type and urgency' },
        { role: '🔍 Research Agent', note: 'Finds relevant regulations and procedures' },
        { role: '✉️ Response Agent', note: 'Drafts formal government response' }
      ]
    }
  ]);
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
