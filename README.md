# ⚖️ Mizan Framework SDK

> Build AI agents with built-in governance, rules enforcement, and audit trails.

## Install

```bash
npm install @mizan/sdk
```

## Quick Setup

```bash
# Copy environment template
cp node_modules/@mizan/sdk/.env.example .env

# Or run the setup wizard
npx mizan setup

# Check your environment
npx mizan doctor
```

## Add your API keys (.env)

```
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

## Build your first agent (3 minutes)

```js
const { MizanAgent, webSearchTool, calculatorTool, autoDetectAdapter } = require('@mizan/sdk');

class MyAgent extends MizanAgent {
  async think(input) {
    const news = await this.useTool('web_search', { query: input.topic });
    return `Analysis: ${news.data?.answer || 'No data'}`;
  }
}

async function main() {
  const agent = new MyAgent({ adapter: autoDetectAdapter() });
  agent.registerTool(webSearchTool);
  agent.registerTool(calculatorTool);

  const result = await agent.run({ topic: 'UAE AI strategy 2031' });
  console.log(result.output);
}

main();
```

## Features

### UAE AI Governance Compliance

`@mizan/sdk` now includes a UAE compliance layer for AI workflows:

- `PDPL` (UAE Federal Decree-Law No. 45/2021): consent, minimization, residency/transfer checks
- `UAE_AI_ETHICS`: inclusiveness, reliability, transparency, privacy, security, accountability
- `NESA`: audit/logging integrity, incident and data classification, access and encryption controls
- `DUBAI_AI_LAW`: framework hook for Dubai-specific governance review

Quick start:

```ts
import { MizanAgent, UAEComplianceLayer, MockAdapter, Rule } from '@mizan/sdk';

class ComplianceAgent extends MizanAgent {
  async think(input: Record<string, unknown>): Promise<string> {
    if (this.adapter) return this.adapter.complete(JSON.stringify(input));
    return 'No adapter configured.';
  }
}

const compliance = new UAEComplianceLayer({
  frameworks: ['PDPL', 'UAE_AI_ETHICS', 'NESA'],
  language: 'both',
  auditLevel: 'full',
  dataResidency: 'UAE',
});

const rules: Rule[] = [
  { id: 'R001', name: 'High Risk Block', condition: 'risk > 0.8', action: 'REJECTED', reason: 'Risk threshold exceeded', priority: 1 },
];

const agent = new ComplianceAgent({
  adapter: new MockAdapter('Loan application queued for review.'),
  rules,
  compliance,
});

const response = await agent.run({
  userId: 'U123',
  action: 'loan_application',
  amount: 50000,
  risk: 0.4,
  purpose: 'credit_assessment',
  consent: true,
  dataResidency: 'UAE',
});

console.log('Decision:', response.decisions[0].result);
console.log('Compliance Score:', response.decisions[0].complianceReport?.score);
console.log('Arabic Summary:', response.decisions[0].complianceReport?.summaryAr);
```

`ComplianceCheck` fields:

| Field | Type | Description |
|---|---|---|
| `framework` | `UAEFramework` | Framework source of the check (`PDPL`, `UAE_AI_ETHICS`, `NESA`, etc.) |
| `article` | `string` | Article/control reference (e.g., `Art. 6`, `AC-01`) |
| `status` | `ComplianceStatus` | `COMPLIANT`, `NON_COMPLIANT`, or `REVIEW_REQUIRED` |
| `requirement` | `string` | English requirement text |
| `requirementAr` | `string` | Arabic requirement text |
| `passed` | `boolean` | Pass/fail result for the check |
| `details` | `string` | Execution details and evidence summary |
| `remediation` | `string` | English remediation guidance |
| `remediationAr` | `string` | Arabic remediation guidance |

See full runnable example: [`examples/uae-compliance.ts`](./examples/uae-compliance.ts)

### 🔧 Tool System

Register tools that your agent can use during execution:

```js
const { MizanAgent } = require('@mizan/sdk');

class MyAgent extends MizanAgent {
  async think(input) {
    const calc = await this.useTool('calculate', { expression: '2 + 2' });
    return `Result: ${calc.data.result}`;
  }
}

// Built-in tools: web_search, calculate, get_datetime, http_request, read_file
agent.registerTool(webSearchTool)
     .registerTool(calculatorTool)   // fluent API
     .registerTool(dateTimeTool);
```

Tools auto-convert to OpenAI/Anthropic function calling formats:

```js
const openAIFunctions = agent.tools.toOpenAIFunctions();
const anthropicTools = agent.tools.toAnthropicTools();
```

### 🧠 Memory

Simple file-based memory with keyword search:

```js
// Store memories
agent.remember('User prefers Arabic responses', ['preference', 'language']);

// Recall by keyword search
const memories = agent.recall('Arabic');
```

### 📡 Streaming

```js
await agent.runStream(
  { topic: 'AI governance' },
  (chunk) => process.stdout.write(chunk),
  (response) => console.log('\nDone:', response.decisions)
);
```

### 📏 Rules Engine

Define rules that gate LLM inputs and outputs:

```js
const agent = new MyAgent({
  rules: [
    { id: 'R1', name: 'Approve High', condition: 'score >= 70', action: 'APPROVED', reason: 'Score meets threshold', priority: 1 },
    { id: 'R2', name: 'Block Low', condition: 'score < 30', action: 'REJECTED', reason: 'Score too low', priority: 2 },
  ]
});
```

### 📋 Audit Trail

Every decision is logged with tamper-evident chaining:

```js
const result = await agent.run({ score: 85 });
console.log(result.auditTrail); // Full audit chain
```

## CLI Commands

```bash
mizan init <name>       # Create a new project
mizan setup             # Interactive environment setup
mizan doctor            # Check environment health
mizan validate <rules>  # Validate rules for conflicts
mizan decide <r> <f>    # Run rules against facts
mizan parse <policy>    # Extract rules from policy text
```

## Auto-Configuration

The SDK auto-detects your LLM provider from environment variables:

```js
const { autoDetectAdapter } = require('@mizan/sdk');

// Checks OPENAI_API_KEY → ANTHROPIC_API_KEY → MockAdapter
const adapter = autoDetectAdapter();
```

## Architecture

```
Input → Pre-check (Rules) → LLM (Think) → Post-check (Rules) → Output
                ↕                                    ↕
           Audit Logger                         Audit Logger
```

## License

MIT — Abdullah Alkaabi
