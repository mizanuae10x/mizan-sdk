import { Rule, Decision, AgentResponse, AuditEntry, LLMAdapter } from './types';
import { RuleEngine } from './RuleEngine';
import { AuditLogger } from './AuditLogger';
import { ToolRegistry, Tool, ToolResult } from './ToolRegistry';
import { MemoryModule, MemoryEntry } from './MemoryModule';
import { config } from './config';

export abstract class MizanAgent {
  protected engine: RuleEngine;
  protected logger: AuditLogger;
  protected adapter: LLMAdapter | null;
  protected tools: ToolRegistry;
  protected memory: MemoryModule;

  constructor(options?: {
    rules?: Rule[];
    adapter?: LLMAdapter;
    auditPath?: string;
    memoryPath?: string;
  }) {
    this.engine = new RuleEngine();
    this.logger = new AuditLogger(options?.auditPath || config.auditPath);
    this.adapter = options?.adapter || null;
    this.tools = new ToolRegistry();
    this.memory = new MemoryModule({ path: options?.memoryPath });

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

  async runStream(
    input: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    onDone?: (response: AgentResponse) => void
  ): Promise<void> {
    // Pre-check
    const preDecision = this.engine.evaluate(input);
    if (preDecision.result === 'REJECTED') {
      const msg = `Blocked by rule: ${preDecision.reason}`;
      onChunk(msg);
      if (onDone) {
        onDone({
          output: msg,
          decisions: [preDecision],
          auditTrail: [this.logger.log(preDecision, input)],
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
      if (onDone) {
        onDone({
          output,
          decisions: [preDecision, postDecision],
          auditTrail: [
            this.logger.log(preDecision, input),
            this.logger.log(postDecision, postFacts),
          ],
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
    if (onDone) {
      onDone({
        output,
        decisions: [preDecision, postDecision],
        auditTrail: [
          this.logger.log(preDecision, input),
          this.logger.log(postDecision, postFacts),
        ],
      });
    }
  }
}
