export interface Rule {
  id: string;
  name: string;
  condition: string;
  action: 'APPROVED' | 'REJECTED' | 'REVIEW';
  reason: string;
  priority: number;
}

export interface Decision {
  result: 'APPROVED' | 'REJECTED' | 'REVIEW';
  matchedRule: Rule | null;
  reason: string;
  score: number;
  auditId: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  input: Record<string, unknown>;
  output: Decision;
  rule: Rule | null;
  hash: string;
  previousHash: string;
}

export interface Conflict {
  ruleA: Rule;
  ruleB: Rule;
  description: string;
}

export interface AgentResponse {
  output: string;
  decisions: Decision[];
  auditTrail: AuditEntry[];
}

export interface LLMAdapter {
  complete(prompt: string): Promise<string>;
}
