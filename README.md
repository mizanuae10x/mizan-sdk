# ⚖️ Mizan SDK

> Developer SDK for building AI agents compliant with the Mizan Framework Neuro-Symbolic architecture.

## Installation

```bash
npm install @mizan/sdk
```

## Quick Start

```javascript
const { RuleEngine, AuditLogger } = require('@mizan/sdk');

// Define rules
const rules = [
  { id: 'R1', name: 'Approve High Score', condition: 'score >= 80', action: 'APPROVED', reason: 'High score', priority: 1 },
  { id: 'R2', name: 'Reject Low Score', condition: 'score < 30', action: 'REJECTED', reason: 'Too low', priority: 2 },
];

// Evaluate
const engine = new RuleEngine();
engine.loadRules(rules);
const decision = engine.evaluate({ score: 90 });

// Audit
const logger = new AuditLogger();
logger.log(decision, { score: 90 });
```

## CLI

```bash
npx mizan init my-project      # Scaffold a new project
npx mizan validate rules.json  # Check rules for conflicts
npx mizan decide rules.json facts.json  # Run evaluation
npx mizan parse policy.txt     # Extract rules from text
```

## Core APIs

- **RuleEngine** — Deterministic rule evaluation (no eval!)
- **AuditLogger** — Immutable SHA-256 hash chain audit log
- **PolicyParser** — LLM-powered rule extraction from policy text
- **MizanAgent** — Abstract base class for governed AI agents
- **Adapters** — OpenAI, Anthropic, and Mock adapters

## Examples

- `examples/investment-screener/` — Masdar-style investment screening
- `examples/compliance-checker/` — UAE commercial license compliance

## License

MIT © Abdullah Alkaabi
