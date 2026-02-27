import { Rule, LLMAdapter } from './types';
import * as fs from 'fs';

const PARSE_PROMPT = `Extract rules from this policy text. Return a JSON array of rules.
Each rule must have: id (string), name (string), condition (JavaScript boolean expression using variable names), action (APPROVED|REJECTED|REVIEW), reason (string), priority (number, lower=higher priority).

Example output:
[{"id":"R1","name":"Min Investment","condition":"amount >= 1000000","action":"APPROVED","reason":"Meets minimum","priority":1}]

Policy text:
`;

function regexParse(text: string): Rule[] {
  const rules: Rule[] = [];
  const lines = text.split('\n').filter(l => l.trim());
  let idx = 1;

  for (const line of lines) {
    const lower = line.toLowerCase();
    let action: 'APPROVED' | 'REJECTED' | 'REVIEW' = 'REVIEW';
    if (lower.includes('must') || lower.includes('required') || lower.includes('reject')) action = 'REJECTED';
    else if (lower.includes('allow') || lower.includes('approve') || lower.includes('accept')) action = 'APPROVED';

    rules.push({
      id: `R${idx}`,
      name: `Rule ${idx}`,
      condition: 'true',
      action,
      reason: line.trim(),
      priority: idx,
    });
    idx++;
  }
  return rules;
}

export class PolicyParser {
  private adapter: LLMAdapter | null;

  constructor(adapter?: LLMAdapter) {
    this.adapter = adapter || null;
  }

  async parse(text: string): Promise<Rule[]> {
    if (!this.adapter) return regexParse(text);

    try {
      const response = await this.adapter.complete(PARSE_PROMPT + text);
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed as Rule[];
      }
    } catch {
      // fallback
    }
    return regexParse(text);
  }

  async parseFile(filePath: string): Promise<Rule[]> {
    const text = fs.readFileSync(filePath, 'utf-8');
    return this.parse(text);
  }
}
