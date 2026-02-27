// SDK auto-reads .env on import
try { require('dotenv/config'); } catch (_) { /* dotenv optional */ }

export const config = {
  openaiKey: process.env.OPENAI_API_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  auditPath: process.env.MIZAN_AUDIT_PATH || './data/audit.jsonl',
  memoryPath: process.env.MIZAN_MEMORY_PATH || './data/memory.json',
  defaultModel: process.env.MIZAN_DEFAULT_MODEL || 'gpt-4o-mini',
  logLevel: (process.env.MIZAN_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
};
