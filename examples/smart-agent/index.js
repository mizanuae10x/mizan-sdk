/**
 * Smart Agent Example — uses tools + memory + streaming
 */
const {
  MizanAgent,
  webSearchTool,
  calculatorTool,
  dateTimeTool,
  autoDetectAdapter,
} = require('../../dist');

class SmartAgent extends MizanAgent {
  async think(input) {
    // Use tools during thinking
    if (input.query) {
      const search = await this.useTool('web_search', { query: input.query });
      if (search.success) {
        this.remember(`Searched: ${input.query} → ${search.data.answer}`, ['search']);
      }
      return search.data?.answer || 'No results found';
    }

    if (this.adapter) {
      return this.adapter.complete(JSON.stringify(input));
    }
    return JSON.stringify({ processed: true, input });
  }
}

async function main() {
  const agent = new SmartAgent({
    adapter: autoDetectAdapter(),
    rules: [
      { id: 'R1', name: 'Allow All', condition: 'true', action: 'APPROVED', reason: 'Default allow', priority: 1 },
    ],
  });

  // Register tools (fluent API)
  agent
    .registerTool(webSearchTool)
    .registerTool(calculatorTool)
    .registerTool(dateTimeTool);

  // Store a memory
  agent.remember('This agent was created for demonstration', ['demo']);

  // Run with streaming
  console.log('🔄 Streaming response:\n');
  await agent.runStream(
    { query: 'UAE artificial intelligence' },
    (chunk) => process.stdout.write(chunk),
    (response) => {
      console.log('\n\n✅ Done!');
      console.log(`Decisions: ${response.decisions.length}`);
    }
  );

  // Recall memories
  const memories = agent.recall('search');
  console.log(`\n🧠 Memories: ${memories.length}`);
}

main().catch(console.error);
