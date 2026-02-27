export interface Tool {
  name: string;
  description: string;
  input: Record<string, string>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  data: unknown;
  error?: string;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { tool: name, success: false, data: null, error: `Tool "${name}" not found` };
    }
    try {
      const data = await tool.handler(params);
      return { tool: name, success: true, data };
    } catch (err: any) {
      return { tool: name, success: false, data: null, error: err.message || String(err) };
    }
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  toOpenAIFunctions(): object[] {
    return this.list().map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.input).map(([k, desc]) => [k, { type: 'string', description: desc }])
          ),
        },
      },
    }));
  }

  toAnthropicTools(): object[] {
    return this.list().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.input).map(([k, desc]) => [k, { type: 'string', description: desc }])
        ),
      },
    }));
  }
}
