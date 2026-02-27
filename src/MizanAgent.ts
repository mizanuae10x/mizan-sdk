import { Rule, Decision, AgentResponse, AuditEntry, LLMAdapter } from './types';
import { RuleEngine } from './RuleEngine';
import { AuditLogger } from './AuditLogger';

export abstract class MizanAgent {
  protected engine: RuleEngine;
  protected logger: AuditLogger;
  protected adapter: LLMAdapter | null;

  constructor(options?: { rules?: Rule[]; adapter?: LLMAdapter; auditPath?: string }) {
    this.engine = new RuleEngine();
    this.logger = new AuditLogger(options?.auditPath);
    this.adapter = options?.adapter || null;

    if (options?.rules) {
      this.engine.loadRules(options.rules);
    }
  }

  abstract think(input: Record<string, unknown>): Promise<string>;

  async run(input: Record<string, unknown>): Promise<AgentResponse> {
    const decisions: Decision[] = [];
    const auditTrail: AuditEntry[] = [];

    // Pre-check
    const preDecision = this.engine.evaluate(input);
    decisions.push(preDecision);
    auditTrail.push(this.logger.log(preDecision, input));

    if (preDecision.result === 'REJECTED') {
      return {
        output: `Blocked by rule: ${preDecision.reason}`,
        decisions,
        auditTrail,
      };
    }

    // LLM call
    const output = await this.think(input);

    // Post-check
    const postFacts = { ...input, llmOutput: output };
    const postDecision = this.engine.evaluate(postFacts);
    decisions.push(postDecision);
    auditTrail.push(this.logger.log(postDecision, postFacts));

    return { output, decisions, auditTrail };
  }
}
