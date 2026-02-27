import { Rule, Decision, AgentResponse, AuditEntry, LLMAdapter } from './types';
import { RuleEngine } from './RuleEngine';
import { AuditLogger } from './AuditLogger';
import { ToolRegistry, Tool, ToolResult } from './ToolRegistry';
import { MemoryModule, MemoryEntry } from './MemoryModule';
import { config } from './config';
import { UAEComplianceLayer } from './compliance';

export abstract class MizanAgent {
  protected engine: RuleEngine;
  protected logger: AuditLogger;
  protected adapter: LLMAdapter | null;
  protected tools: ToolRegistry;
  protected memory: MemoryModule;
  protected compliance: UAEComplianceLayer | null;

  constructor(options?: {
    rules?: Rule[];
    adapter?: LLMAdapter;
    auditPath?: string;
    memoryPath?: string;
    compliance?: UAEComplianceLayer;
  }) {
    this.engine = new RuleEngine();
    this.logger = new AuditLogger(options?.auditPath || config.auditPath);
    this.adapter = options?.adapter || null;
    this.tools = new ToolRegistry();
    this.memory = new MemoryModule({ path: options?.memoryPath });
    this.compliance = options?.compliance || null;

    if (options?.rules) {
      this.engine.loadRules(options.rules);
    }
  }

  abstract think(input: Record<string, unknown>): Promise<string>;

  registerTool(tool: Tool): this {
    this.tools.register(tool);
    return this;
  }

  async useTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    return this.tools.execute(name, params);
  }

  remember(content: string, tags?: string[]): MemoryEntry {
    return this.memory.store(content, {}, tags);
  }

  recall(query: string, limit?: number): MemoryEntry[] {
    return this.memory.search(query, limit);
  }

  async run(input: Record<string, unknown>): Promise<AgentResponse> {
    const decisions: Decision[] = [];
    const auditTrail: AuditEntry[] = [];

    // Pre-check
    const preDecision = this.engine.evaluate(input);
    decisions.push(preDecision);
    const preAudit = this.logger.log(preDecision, input);
    this.applyCompliance(input, preDecision, preAudit);
    auditTrail.push(preAudit);

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
    const postAudit = this.logger.log(postDecision, postFacts);
    this.applyCompliance(postFacts, postDecision, postAudit);
    auditTrail.push(postAudit);

    return { output, decisions, auditTrail };
  }

  async runStream(
    input: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    onDone?: (response: AgentResponse) => void
  ): Promise<void> {
    // Pre-check
    const preDecision = this.engine.evaluate(input);
    const preAudit = this.logger.log(preDecision, input);
    this.applyCompliance(input, preDecision, preAudit);

    if (preDecision.result === 'REJECTED') {
      const msg = `Blocked by rule: ${preDecision.reason}`;
      onChunk(msg);
      if (onDone) {
        onDone({
          output: msg,
          decisions: [preDecision],
          auditTrail: [preAudit],
        });
      }
      return;
    }

    // Try native streaming via OpenAI adapter
    if (this.adapter && 'completeStream' in this.adapter) {
      const chunks: string[] = [];
      await (this.adapter as any).completeStream(
        typeof input === 'string' ? input : JSON.stringify(input),
        (chunk: string) => {
          chunks.push(chunk);
          onChunk(chunk);
        }
      );
      const output = chunks.join('');
      const postFacts = { ...input, llmOutput: output };
      const postDecision = this.engine.evaluate(postFacts);
      const postAudit = this.logger.log(postDecision, postFacts);
      this.applyCompliance(postFacts, postDecision, postAudit);
      if (onDone) {
        onDone({
          output,
          decisions: [preDecision, postDecision],
          auditTrail: [preAudit, postAudit],
        });
      }
      return;
    }

    // Fallback: simulate streaming by chunking think() output
    const output = await this.think(input);
    const words = output.split(' ');
    for (const word of words) {
      onChunk(word + ' ');
    }

    const postFacts = { ...input, llmOutput: output };
    const postDecision = this.engine.evaluate(postFacts);
    const postAudit = this.logger.log(postDecision, postFacts);
    this.applyCompliance(postFacts, postDecision, postAudit);
    if (onDone) {
      onDone({
        output,
        decisions: [preDecision, postDecision],
        auditTrail: [preAudit, postAudit],
      });
    }
  }

  private applyCompliance(input: Record<string, unknown>, decision: Decision, auditEntry: AuditEntry): void {
    if (!this.compliance) return;
    const report = this.compliance.evaluate(input, decision, auditEntry);
    decision.complianceReport = report;
    auditEntry.compliance = report;
  }
}
